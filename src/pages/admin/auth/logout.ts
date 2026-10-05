import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { ACCESS_COOKIE, clearSessionCookies, isSameOrigin } from '../../../lib/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });

  // Best effort: end the session on the Supabase side too, so a copied refresh token stops working.
  const access = cookies.get(ACCESS_COOKIE)?.value;
  if (access && env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) {
    await fetch(`${env.SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${access}` },
    }).catch(() => undefined);
  }

  clearSessionCookies(cookies);
  return new Response(null, { status: 303, headers: { location: '/admin/login' } });
};
