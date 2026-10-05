// Records the progress of a publish job in the database, for the "Publish" GitHub Actions workflow.
//
//   node scripts/publish-job.mjs start   claim the queued job (queued -> building); prints skip=true when
//                                         the job was superseded and must not be built
//   node scripts/publish-job.mjs finish  building -> deployed
//   node scripts/publish-job.mjs fail    queued/building -> failed (message from ERROR_MESSAGE)
//
// Environment: SUPABASE_URL, SUPABASE_SECRET_KEY (backend secret), JOB_ID, and for `start` RUN_ID.
// Only ids and fixed messages are written; build output (which could echo settings) never is.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const STALE_MINUTES = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A job still "building" after this long belongs to a runner that died; it must not block new builds. */
export function staleCutoff(now = new Date(), minutes = STALE_MINUTES) {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

/** A short single-line message that is safe to store (the column allows 4000 characters). */
export function failureMessage(raw) {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  return text || 'The build failed. Open the workflow run for details.';
}

/** The database requests for a command, as plain data (so they can be tested without a network). */
export function plan(command, { jobId, runId, message, now = new Date() }) {
  if (!UUID_RE.test(jobId ?? '')) throw new Error('JOB_ID must be a uuid');
  const at = now.toISOString();
  const table = '/rest/v1/publish_jobs';

  if (command === 'start') {
    if (!/^\d{1,20}$/.test(runId ?? '')) throw new Error('RUN_ID must be a number');
    return [
      {
        name: 'reap',
        method: 'PATCH',
        path: `${table}?status=eq.building&started_at=lt.${encodeURIComponent(staleCutoff(now))}`,
        body: { status: 'failed', finished_at: at, error: 'The build did not finish in time.' },
      },
      {
        name: 'claim',
        method: 'PATCH',
        path: `${table}?id=eq.${jobId}&status=eq.queued`,
        body: { status: 'building', started_at: at, deploy_ref: runId },
      },
    ];
  }
  if (command === 'finish') {
    return [
      {
        name: 'finish',
        method: 'PATCH',
        path: `${table}?id=eq.${jobId}&status=eq.building`,
        body: { status: 'deployed', finished_at: at },
      },
    ];
  }
  if (command === 'fail') {
    return [
      {
        name: 'fail',
        method: 'PATCH',
        path: `${table}?id=eq.${jobId}&status=in.(queued,building)`,
        body: { status: 'failed', finished_at: at, error: failureMessage(message) },
      },
    ];
  }
  throw new Error(`unknown command: ${command}`);
}

/** Runs the plan. Returns the rows each step changed. */
export async function run(command, env, fetchImpl = fetch) {
  const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = env;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');

  const results = {};
  for (const step of plan(command, {
    jobId: env.JOB_ID,
    runId: env.RUN_ID,
    message: env.ERROR_MESSAGE,
  })) {
    const response = await fetchImpl(`${url.replace(/\/+$/, '')}${step.path}`, {
      method: step.method,
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify(step.body),
    });
    if (!response.ok) {
      // Status only: the response body is not logged.
      throw new Error(`${step.name} failed (HTTP ${response.status})`);
    }
    results[step.name] = await response.json();
  }
  return results;
}

async function main() {
  const command = process.argv[2];
  const results = await run(command, process.env);

  if (command === 'start') {
    const claimed = results.claim.length === 1;
    console.log(
      claimed ? 'job claimed: building' : 'job is not queued any more (superseded): skipping',
    );
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `skip=${claimed ? 'false' : 'true'}\n`);
  } else {
    const changed = Object.values(results).flat().length;
    console.log(`${command}: ${changed} row(s) updated`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'unknown error');
    process.exit(1);
  });
}
