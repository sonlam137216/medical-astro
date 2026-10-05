import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../lib/admin-auth';
import { BUILTIN_PAGES } from '../../../../lib/cms/pages';

export const prerender = false;

// Adds a row for each built-in page that has none yet. Existing rows (and what was typed in them) are kept.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const { error } = await locals.db.from('pages').upsert(
    BUILTIN_PAGES.map((p) => ({ path: p.path, title: p.title })),
    { onConflict: 'path', ignoreDuplicates: true },
  );
  if (error) console.error('pages seed failed', error.code);
  return new Response(null, {
    status: 303,
    headers: { location: `/admin/content/pages?${error ? 'error=1' : 'seeded=1'}` },
  });
};
