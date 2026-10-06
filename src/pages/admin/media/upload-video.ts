import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSameOrigin } from '../../../lib/admin-auth';
import { MAX_VIDEO_BYTES, videoKey } from '../../../lib/media';
import { readAlt } from '../../../lib/media-upload';
import { checkMp4Head } from '../../../lib/mp4';

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEAD_BYTES = 64 * 1024;

const json = (status: number, body: { ok: boolean; id?: string; error?: string }) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const dimension = (raw: string | null) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 7680 ? n : null;
};

// The request body is the MP4 file itself (not a form), so it can go to R2 as a stream instead of being
// held in memory. Description, poster and size travel in the query string.
export const POST: APIRoute = async ({ request, url, locals }) => {
  if (!isSameOrigin(request)) return json(403, { ok: false, error: 'Forbidden.' });

  const length = Number(request.headers.get('content-length'));
  if (!Number.isInteger(length) || length <= 0)
    return json(411, { ok: false, error: 'Missing file size.' });
  if (length > MAX_VIDEO_BYTES) {
    return json(413, {
      ok: false,
      error: `The video is larger than ${MAX_VIDEO_BYTES / 1024 / 1024} MB. Compress it first.`,
    });
  }
  if (!request.body) return json(400, { ok: false, error: 'Choose a video.' });

  const alt = readAlt(url.searchParams.get('alt_text') ?? '', false, 'video');
  if (!alt.ok) return json(422, { ok: false, error: alt.error });

  const posterId = url.searchParams.get('poster') || null;
  if (posterId) {
    if (!UUID_RE.test(posterId)) return json(422, { ok: false, error: 'Invalid cover image.' });
    const { data: poster } = await locals.db
      .from('media_assets')
      .select('id')
      .eq('id', posterId)
      .eq('kind', 'image')
      .maybeSingle();
    if (!poster) return json(422, { ok: false, error: 'The chosen cover image does not exist.' });
  }

  // Read the start of the file and check it before anything is stored.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let have = 0;
  while (have < HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    have += value.byteLength;
  }
  const head = new Uint8Array(have);
  let at = 0;
  for (const c of chunks) {
    head.set(c, at);
    at += c.byteLength;
  }
  const check = checkMp4Head(head);
  if (!check.ok) {
    await reader.cancel().catch(() => undefined);
    return json(415, {
      ok: false,
      error:
        check.reason === 'not-mp4'
          ? 'Only MP4 videos are accepted.'
          : 'This MP4 must be prepared for web playback first (see the hint under the form).',
    });
  }

  const id = crypto.randomUUID();
  const key = videoKey(id, 1);

  // Pass the file on as a stream of the declared length. If the browser sends fewer or more bytes than it
  // promised, the stream errors and nothing is stored.
  const fixed = new FixedLengthStream(length);
  const pump = (async () => {
    const writer = fixed.writable.getWriter();
    try {
      await writer.write(head);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
      await writer.close();
    } catch (e) {
      await writer.abort(e).catch(() => undefined);
      throw e;
    }
  })();

  try {
    await Promise.all([
      env.MEDIA.put(key, fixed.readable, {
        httpMetadata: {
          contentType: 'video/mp4',
          cacheControl: 'public, max-age=31536000, immutable',
        },
      }),
      pump,
    ]);
  } catch {
    await env.MEDIA.delete(key).catch(() => undefined);
    console.error('video upload: storage write failed');
    return json(503, { ok: false, error: 'Could not store the video. Please try again.' });
  }

  const { error } = await locals.db.from('media_assets').insert({
    id,
    r2_key: key,
    kind: 'video',
    mime_type: 'video/mp4',
    size_bytes: length,
    width: dimension(url.searchParams.get('width')),
    height: dimension(url.searchParams.get('height')),
    alt_text: alt.altText,
    is_decorative: false,
    poster_asset_id: posterId,
    variant_widths: [],
  });
  if (error) {
    await env.MEDIA.delete(key).catch(() => undefined);
    console.error('video upload: insert failed', error.code);
    return json(500, { ok: false, error: 'Could not save the video. Please try again.' });
  }

  return json(200, { ok: true, id });
};
