import { env } from 'cloudflare:workers';
import type { AdminDb, AdminUser } from './admin-auth';

// Starting a build. Publishing only records a revision and a job; the build itself runs in GitHub Actions
// (.github/workflows/publish.yml), never inside a Worker request. The Worker's only part is asking GitHub to
// start that workflow with the job it should run.

export type DispatchResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'rejected' | 'unreachable'; status?: number };

/** Ask GitHub to run the publish workflow for one job. Never throws; never includes the token in results. */
export async function dispatchBuild(job: {
  jobId: string;
  revisionId: string;
}): Promise<DispatchResult> {
  const token = env.GITHUB_DISPATCH_TOKEN;
  const { GITHUB_REPO: repo, GITHUB_WORKFLOW: workflow, PUBLISH_TARGET: target } = env;
  if (!token || !repo || !workflow || !target) return { ok: false, reason: 'not_configured' };

  const base = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  try {
    const response = await fetch(`${base}/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'melatec-publish',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { job_id: job.jobId, revision_id: job.revisionId, target },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // GitHub answers 204 with no body when the workflow was queued.
    return response.status === 204
      ? { ok: true }
      : { ok: false, reason: 'rejected', status: response.status };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

export type QueueOutcome = 'triggered' | 'not_configured' | 'failed';

/**
 * Queue a build for a revision: a newer job replaces a waiting one (the database allows at most one
 * waiting and one building job), then the workflow is started. If GitHub refuses, the job is marked
 * failed straight away so the page tells the truth and the slot is free for a retry.
 */
export async function queueBuild(
  db: AdminDb,
  admin: AdminUser,
  revisionId: string,
): Promise<QueueOutcome> {
  const { error: supersedeError } = await db
    .from('publish_jobs')
    .update({ status: 'superseded' })
    .eq('status', 'queued');
  if (supersedeError) throw new Error(`supersede failed (${supersedeError.code})`);

  const { data: job, error: jobError } = await db
    .from('publish_jobs')
    .insert({ revision_id: revisionId, requested_by: admin.id })
    .select('id')
    .single();
  if (jobError) throw new Error(`job insert failed (${jobError.code})`);

  const result = await dispatchBuild({ jobId: job.id, revisionId });
  if (result.ok) return 'triggered';
  // No token configured (local development): the job stays queued; nothing is wrong with it.
  if (result.reason === 'not_configured') return 'not_configured';

  await db
    .from('publish_jobs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error: 'Could not start the build: GitHub did not accept the request.',
    })
    .eq('id', job.id);
  return 'failed';
}
