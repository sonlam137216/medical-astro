import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { parseKey } from '../../lib/media';

// Serves media from R2 through the Worker. This is the fallback for local dev and staging; production
// points R2_PUBLIC_BASE_URL at a custom domain on the bucket so visitors never reach this route (Worker
// requests are metered, bucket requests through the CDN are not).
export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const key = `media/${params.path ?? ''}`;
  // Only keys the CMS itself writes. Anything else is not a public file.
  if (!parseKey(key)) return new Response('Not found', { status: 404 });

  const object = await env.MEDIA.get(key, { onlyIf: request.headers });
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('x-content-type-options', 'nosniff');
  // Keys carry a version, so a key's content never changes.
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  // Conditional request that matched: R2 returns the metadata without a body.
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
};
