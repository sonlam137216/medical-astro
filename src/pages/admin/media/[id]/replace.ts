import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSameOrigin } from '../../../../lib/admin-auth';
import { parseKey, variantKey } from '../../../../lib/media';
import { parseUpload } from '../../../../lib/media-upload';

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, body: { ok: boolean; error?: string }) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Puts a new file in place of an image of the library, keeping its description and every place that uses it.
// The new files get the next version number in their key, so a cached old picture can never be served for the new
// one. The old files are left in place on purpose: the live website still points at them until the next
// Publish has been deployed. "Clean up unused files" (Media page) removes them later.
export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!isSameOrigin(request)) return json(403, { ok: false, error: 'Forbidden.' });
  const id = params.id ?? '';
  if (!UUID_RE.test(id)) return json(404, { ok: false, error: 'Not found.' });

  const { data: asset } = await locals.db
    .from('media_assets')
    .select('r2_key, width, height, focal_x, focal_y')
    .eq('id', id)
    .eq('kind', 'image')
    .maybeSingle();
  const current = asset && parseKey(asset.r2_key);
  if (!asset || !current) return json(404, { ok: false, error: 'Not found.' });

  const parsed = await parseUpload(request, { needAlt: false });
  if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error });
  const { variants, color, hash } = parsed.value;

  const version = current.version + 1;
  const keys = variants.map((v) => variantKey(id, version, v.width));
  const largest = variants[variants.length - 1];

  try {
    await Promise.all(
      variants.map((v, i) =>
        env.MEDIA.put(keys[i], v.bytes, {
          httpMetadata: {
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000, immutable',
          },
        }),
      ),
    );
  } catch {
    await env.MEDIA.delete(keys).catch(() => undefined);
    console.error('media replace: storage write failed');
    return json(503, { ok: false, error: 'Could not store the image. Please try again.' });
  }

  // A focus point is a position inside the picture: it only still means something when the proportions are
  // about the same.
  const before = (asset.width ?? 1) / (asset.height ?? 1);
  const after = largest.width / largest.height;
  const sameShape = Math.abs(before - after) / before < 0.03;

  const { error } = await locals.db
    .from('media_assets')
    .update({
      r2_key: keys[keys.length - 1],
      size_bytes: variants.reduce((sum, v) => sum + v.bytes.byteLength, 0),
      width: largest.width,
      height: largest.height,
      variant_widths: variants.map((v) => v.width),
      dominant_color: color,
      content_hash: hash,
      ...(sameShape ? {} : { focal_x: null, focal_y: null }),
    })
    .eq('id', id);
  if (error) {
    await env.MEDIA.delete(keys).catch(() => undefined);
    console.error('media replace: update failed', error.code);
    return json(500, { ok: false, error: 'Could not save the image. Please try again.' });
  }
  return json(200, { ok: true });
};
