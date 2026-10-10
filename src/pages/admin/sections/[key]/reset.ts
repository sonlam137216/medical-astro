import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../lib/admin-auth';
import { sectionByKey } from '../../../../lib/cms/sections';
import { resetSection } from '../../../../lib/cms/section-admin';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const def = sectionByKey(params.key);
  if (!def) return new Response('Not found', { status: 404 });
  const ok = await resetSection(locals.db, def);
  const to = ok ? '/admin/sections?reset=1' : `/admin/sections/${def.key}?error=failed`;
  return new Response(null, { status: 303, headers: { location: to } });
};
