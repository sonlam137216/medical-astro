import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSameOrigin, signOut } from '../../../lib/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });

  // Deletes the session row, so a copied cookie stops working too.
  await signOut(env.DB, cookies).catch(() => undefined);
  return new Response(null, { status: 303, headers: { location: '/admin/login' } });
};
