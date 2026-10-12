import type { APIRoute } from 'astro';
import { SITE_INDEXABLE } from '../lib/seo';

// Prerendered into /robots.txt. A build that may not be indexed (staging, local, or no SITE_URL yet) refuses all
// crawlers; an indexable one keeps them out of the private areas and names the sitemap (integrations/sitemap-file.mjs).
export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const lines = SITE_INDEXABLE
    ? [
        'User-agent: *',
        'Disallow: /admin/',
        'Disallow: /api/',
        ...(site ? ['', `Sitemap: ${new URL('/sitemap.xml', site).href}`] : []),
      ]
    : ['User-agent: *', 'Disallow: /'];
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
