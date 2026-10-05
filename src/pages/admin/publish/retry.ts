import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/admin-auth';
import { queueBuild } from '../../../lib/publish';

export const prerender = false;

const to = (query: string) =>
  new Response(null, { status: 303, headers: { location: `/admin/publish?${query}` } });

// Start another build for the newest revision, for when the last attempt failed or never started.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const { db, admin } = locals;

  try {
    const { data: revision } = await db
      .from('content_revisions')
      .select('id, revision_number')
      .order('revision_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!revision) return to('error=1');

    // A build that is waiting, running or already live for this revision needs no retry.
    const { data: active } = await db
      .from('publish_jobs')
      .select('id')
      .eq('revision_id', revision.id)
      .in('status', ['queued', 'building', 'deployed'])
      .limit(1);
    if (active && active.length > 0) return to('error=busy');

    const build = await queueBuild(db, admin, revision.id);
    return to(`published=${revision.revision_number}&build=${build}`);
  } catch (error) {
    console.error('retry failed', error instanceof Error ? error.message : 'unknown');
    return to('error=1');
  }
};
