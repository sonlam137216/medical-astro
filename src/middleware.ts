import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { authenticate } from './lib/admin-auth';

// Everything under /admin needs a signed-in admin, except the sign-in page and its POST endpoint.
// Public pages are prerendered, so this only runs for /admin requests in the Worker.
const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/admin/auth/login']);

const isAdminPath = (path: string) => path === '/admin' || path.startsWith('/admin/');

const redirectTo = (location: string) => new Response(null, { status: 303, headers: { location } });

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname.replace(/\/+$/, '') || '/';
  if (!isAdminPath(path)) return next();

  if (!PUBLIC_ADMIN_PATHS.has(path)) {
    const session = await authenticate(env.DB, context.cookies);
    if (!session) return harden(redirectTo('/admin/login'));
    context.locals.admin = session.admin;
    context.locals.db = session.db;
  }

  return harden(await next());
});

/** Admin responses carry personal data and must never be cached or indexed. */
function harden(response: Response) {
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-robots-tag', 'noindex, nofollow');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'same-origin');
  return response;
}
