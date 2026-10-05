import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSameOrigin } from '../../../../lib/admin-auth';
import { allVariantKeys } from '../../../../lib/media';

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const to = (location: string) => new Response(null, { status: 303, headers: { location } });

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const id = params.id ?? '';
  if (!UUID_RE.test(id)) return new Response('Not found', { status: 404 });

  const { data: asset } = await locals.db
    .from('media_assets')
    .select('r2_key, variant_widths')
    .eq('id', id)
    .maybeSingle();
  if (!asset) return new Response('Not found', { status: 404 });

  // The database refuses to delete an image that something still uses (foreign keys are `restrict`).
  const { error } = await locals.db.from('media_assets').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') return to(`/admin/media/${id}?error=inuse`);
    console.error('media delete failed', error.code);
    return to(`/admin/media/${id}?error=1`);
  }

  // Only after the row is gone. A leftover file is harmless; a row without files would break pages.
  await env.MEDIA.delete(allVariantKeys(asset.r2_key, asset.variant_widths)).catch(() => {
    console.error('media delete: could not remove files');
  });
  return to('/admin/media?deleted=1');
};
