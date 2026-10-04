import type { APIRoute } from 'astro';

// On-demand route (runs in the Worker). Exists to verify the dynamic path works
// end to end; never cache it and never put personal data in the response.
export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ ok: true }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
