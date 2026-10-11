import type { APIRoute } from 'astro';
import { listMedia } from '../../../lib/media-picker';
import { parseIds } from '../../../lib/media-list';

export const prerender = false;

// JSON for the media picker window: `?kind=image|video&q=<words>&page=<n>`, or `?kind=image&ids=<id>,<id>` for
// specific items. Admin only (the middleware covers everything under /admin); a read, so no origin check.
export const GET: APIRoute = async ({ url, locals }) => {
  const kind = url.searchParams.get('kind') === 'video' ? 'video' : 'image';
  const ids = url.searchParams.has('ids') ? parseIds(url.searchParams.get('ids')) : undefined;
  const result = await listMedia(locals.db, {
    kind,
    query: (url.searchParams.get('q') ?? '').slice(0, 100),
    page: Number(url.searchParams.get('page')) || 1,
    ids,
  });
  return new Response(JSON.stringify(result), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
