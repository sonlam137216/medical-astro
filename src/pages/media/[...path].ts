import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { contentRange, isServableKey, isVideoKey, startsBeyond } from '../../lib/media';

// Serves media from R2 through the Worker. This is the fallback for local dev and staging; production
// points R2_PUBLIC_BASE_URL at a custom domain on the bucket so visitors never reach this route (Worker
// requests are metered, bucket requests through the CDN are not).
export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const key = `media/${params.path ?? ''}`;
  // Only keys the CMS itself writes. Anything else is not a public file.
  if (!isServableKey(key)) return new Response('Not found', { status: 404 });

  // Range: browsers ask for a slice of a video to start playing and to seek. R2 reads both conditions
  // straight from the request headers.
  const range = isVideoKey(key) ? request.headers.has('range') : false;
  let object;
  try {
    object = await env.MEDIA.get(key, {
      onlyIf: request.headers,
      ...(range ? { range: request.headers } : {}),
    });
  } catch {
    // A Range header R2 cannot satisfy (outside the file, or malformed).
    return new Response(null, { status: 416, headers: { 'content-range': 'bytes */*' } });
  }
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('x-content-type-options', 'nosniff');
  // Keys carry a version, so a key's content never changes.
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (isVideoKey(key)) headers.set('accept-ranges', 'bytes');

  // Conditional request that matched: R2 returns the metadata without a body.
  if (!('body' in object)) return new Response(null, { status: 304, headers });

  // R2 answers a start beyond the end of the file with the whole file. HTTP says 416.
  if (range && startsBeyond(request.headers.get('range'), object.size)) {
    headers.set('content-range', `bytes */${object.size}`);
    return new Response(null, { status: 416, headers });
  }

  if (range && object.range) {
    const slice = contentRange(object.range, object.size);
    if (!slice) {
      headers.set('content-range', `bytes */${object.size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set('content-range', `bytes ${slice.start}-${slice.end}/${object.size}`);
    headers.set('content-length', String(slice.end - slice.start + 1));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('content-length', String(object.size));
  return new Response(object.body, { headers });
};
