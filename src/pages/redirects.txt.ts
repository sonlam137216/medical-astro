import type { APIRoute } from 'astro';
import { loadSnapshot } from '../lib/content';

// Prerendered at build time. astro.config.mjs renames the output to `_redirects`, the file Cloudflare reads
// for static redirects (they are answered by the edge without running the Worker). Astro does not route
// files whose name starts with an underscore, hence the detour.
export const prerender = true;

export const GET: APIRoute = async () => {
  const redirects = (await loadSnapshot())?.redirects ?? [];
  const lines = redirects.map((r) => `${r.from} ${r.to} ${r.status}`);
  return new Response(lines.length > 0 ? `${lines.join('\n')}\n` : '# No redirects.\n', {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
