import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  createUserClient,
  isSameOrigin,
  setSessionCookies,
  verifyAdmin,
} from '../../../lib/admin-auth';
import { readBodyLimited } from '../../../lib/consultation';

export const prerender = false;

const back = (error: string) =>
  new Response(null, { status: 303, headers: { location: `/admin/login?error=${error}` } });

export const POST: APIRoute = async ({ request, cookies, url }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });

  // Per-IP brake on guessing. The IP is only the limiter key; it is never stored or logged.
  const ip = request.headers.get('cf-connecting-ip');
  if (env.ADMIN_LOGIN_LIMITER && ip) {
    const { success } = await env.ADMIN_LOGIN_LIMITER.limit({ key: ip });
    if (!success) return back('rate');
  }

  const text = await readBodyLimited(request, 4 * 1024);
  if (text === null) return new Response('Payload Too Large', { status: 413 });
  const form = new URLSearchParams(text);
  const email = (form.get('email') ?? '').trim();
  const password = form.get('password') ?? '';
  if (!email || !password || email.length > 254 || password.length > 256) return back('1');

  const client = createUserClient(env);
  if (!client) {
    console.error('admin login: Supabase is not configured');
    return back('unavailable');
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  // One generic message for every failure (wrong password, unknown user, not an admin).
  if (error || !data.session) return back('1');

  // A valid Supabase user who is not listed in `admins` gets no session at all.
  const admin = await verifyAdmin(env, data.session.access_token);
  if (!admin) return back('1');

  setSessionCookies(cookies, data.session, url.protocol === 'https:');
  return new Response(null, { status: 303, headers: { location: '/admin' } });
};
