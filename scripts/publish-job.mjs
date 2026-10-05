// Records the progress of a publish job in the database, for the "Publish" GitHub Actions workflow.
//
//   node scripts/publish-job.mjs start   claim the queued job (queued -> building); prints skip=true when
//                                         the job was superseded and must not be built
//   node scripts/publish-job.mjs finish  building -> deployed
//   node scripts/publish-job.mjs fail    queued/building -> failed (message from ERROR_MESSAGE)
//
// Environment: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (backend secret), D1_DATABASE_ID, JOB_ID, and for
// `start` RUN_ID. Talks to D1 through Cloudflare's HTTP API (src/lib/d1-http.ts).
// Only ids and fixed messages are written; build output (which could echo settings) never is.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { d1Query } from '../src/lib/d1-http.ts';

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

/** The database statements for a command, as plain data (so they can be tested without a network). */
export function plan(command, { jobId, runId, message, now = new Date() }) {
  if (!UUID_RE.test(jobId ?? '')) throw new Error('JOB_ID must be a uuid');
  const at = now.toISOString();

  // Every statement is guarded by the current status, so a stale or repeated call changes nothing.
  if (command === 'start') {
    if (!/^\d{1,20}$/.test(runId ?? '')) throw new Error('RUN_ID must be a number');
    return [
      {
        name: 'reap',
        sql: "UPDATE publish_jobs SET status = 'failed', finished_at = ?, error = ? WHERE status = 'building' AND started_at < ? RETURNING id",
        params: [at, 'The build did not finish in time.', staleCutoff(now)],
      },
      {
        name: 'claim',
        sql: "UPDATE publish_jobs SET status = 'building', started_at = ?, deploy_ref = ? WHERE id = ? AND status = 'queued' RETURNING id",
        params: [at, runId, jobId],
      },
    ];
  }
  if (command === 'finish') {
    return [
      {
        name: 'finish',
        sql: "UPDATE publish_jobs SET status = 'deployed', finished_at = ? WHERE id = ? AND status = 'building' RETURNING id",
        params: [at, jobId],
      },
    ];
  }
  if (command === 'fail') {
    return [
      {
        name: 'fail',
        sql: "UPDATE publish_jobs SET status = 'failed', finished_at = ?, error = ? WHERE id = ? AND status IN ('queued', 'building') RETURNING id",
        params: [at, failureMessage(message), jobId],
      },
    ];
  }
  throw new Error(`unknown command: ${command}`);
}

/** Runs the plan. Returns the rows each step changed. */
export async function run(command, env, fetchImpl = fetch) {
  const {
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: apiToken,
    D1_DATABASE_ID: databaseId,
  } = env;
  if (!accountId || !apiToken || !databaseId) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and D1_DATABASE_ID are required');
  }
  const config = { accountId, apiToken, databaseId, baseUrl: env.CLOUDFLARE_API_URL };

  const results = {};
  for (const step of plan(command, {
    jobId: env.JOB_ID,
    runId: env.RUN_ID,
    message: env.ERROR_MESSAGE,
  })) {
    try {
      results[step.name] = await d1Query(config, step.sql, step.params, fetchImpl);
    } catch (error) {
      // d1Query's message carries the HTTP status or Cloudflare error code only.
      throw new Error(`${step.name} failed (${error instanceof Error ? error.message : 'error'})`, {
        cause: error,
      });
    }
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
