import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSameOrigin } from '../../../lib/admin-auth';
import { variantKey } from '../../../lib/media';
import { parseUpload } from '../../../lib/media-upload';

export const prerender = false;

const json = (status: number, body: { ok: boolean; id?: string; error?: string }) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return json(403, { ok: false, error: 'Forbidden.' });

  const parsed = await parseUpload(request);
  if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error });
  const { variants, altText, isDecorative } = parsed.value;

  const id = crypto.randomUUID();
  const version = 1;
  const keys = variants.map((v) => variantKey(id, version, v.width));
  const largest = variants[variants.length - 1];

  // Files first, row second: a row never points at files that are not there. If the row fails, the files
  // are removed again.
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
    console.error('media upload: storage write failed');
    return json(503, { ok: false, error: 'Could not store the image. Please try again.' });
  }

  const { error } = await locals.db.from('media_assets').insert({
    id,
    r2_key: keys[keys.length - 1],
    kind: 'image',
    mime_type: 'image/webp',
    size_bytes: variants.reduce((sum, v) => sum + v.bytes.byteLength, 0),
    width: largest.width,
    height: largest.height,
    alt_text: altText,
    is_decorative: isDecorative,
    variant_widths: variants.map((v) => v.width),
  });
  if (error) {
    await env.MEDIA.delete(keys).catch(() => undefined);
    console.error('media upload: insert failed', error.code);
    return json(500, { ok: false, error: 'Could not save the image. Please try again.' });
  }

  return json(200, { ok: true, id });
};
