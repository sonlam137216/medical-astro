import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSameOrigin, setSessionCookie, signIn } from '../../../lib/admin-auth';
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

  if (!env.DB) {
    console.error('admin login: the DB binding is not configured');
    return back('unavailable');
  }

  // One generic message for every failure (wrong password, unknown account).
  let session;
  try {
    session = await signIn(env.DB, email, password);
  } catch {
    console.error('admin login: database error');
    return back('unavailable');
  }
  if (!session) return back('1');

  setSessionCookie(cookies, session.token, url.protocol === 'https:');
  return new Response(null, { status: 303, headers: { location: '/admin' } });
};
