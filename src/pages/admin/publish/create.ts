import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSameOrigin } from '../../../lib/admin-auth';
import { readBodyLimited } from '../../../lib/consultation';
import { queueBuild } from '../../../lib/publish';
import type { Json } from '../../../lib/db-schema';
import {
  SNAPSHOT_SCHEMA_VERSION,
  buildSnapshot,
  hashSnapshot,
  snapshotProblems,
} from '../../../lib/snapshot';

export const prerender = false;

const to = (query: string) =>
  new Response(null, { status: 303, headers: { location: `/admin/publish?${query}` } });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });

  const text = await readBodyLimited(request, 4 * 1024);
  if (text === null) return new Response('Payload Too Large', { status: 413 });
  const note = (new URLSearchParams(text).get('note') ?? '').replace(/\s+/g, ' ').trim();
  if (note.length > 500) return to('error=1');

  const { db, admin } = locals;
  try {
    const snapshot = await buildSnapshot(db);
    // Nothing is published with an image that has no text alternative.
    if (snapshotProblems(snapshot, env.PUBLISH_TARGET).length > 0) return to('error=problems');
    const hash = await hashSnapshot(snapshot);

    // Publishing the same content twice would only create noise.
    const { data: latest } = await db
      .from('content_revisions')
      .select('content_hash')
      .order('revision_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.content_hash === hash) return to('unchanged=1');

    const { data: revision, error: revisionError } = await db
      .from('content_revisions')
      .insert({
        snapshot: snapshot as unknown as NonNullable<Json>,
        snapshot_schema_version: SNAPSHOT_SCHEMA_VERSION,
        content_hash: hash,
        note: note || null,
        created_by: admin.id,
      })
      .select('id, revision_number')
      .single();
    if (revisionError) throw new Error(`revision insert failed (${revisionError.code})`);

    const build = await queueBuild(db, admin, revision.id);
    return to(`published=${revision.revision_number}&build=${build}`);
  } catch (error) {
    // Messages carry codes only, never content.
    console.error('publish failed', error instanceof Error ? error.message : 'unknown');
    return to('error=1');
  }
};
