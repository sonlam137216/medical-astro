import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../../lib/admin-auth';
import { afterSave, deleteRow, loadRow, redirectTo } from '../../../../../lib/cms/admin';
import { entityByKey } from '../../../../../lib/cms/entities';
import { UUID_RE } from '../../../../../lib/cms/fields';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const def = entityByKey(params.entity);
  const id = params.id ?? '';
  if (!def || !def.deletable || !UUID_RE.test(id))
    return new Response('Not found', { status: 404 });

  // A treatment goes back to the page of its service: read which one before it is gone.
  const row = def.parent ? await loadRow(locals.db, def, id) : null;
  const outcome = await deleteRow(locals.db, def, id);
  if (outcome === 'ok') return redirectTo(afterSave(def, row, 'deleted'));
  return redirectTo(`/admin/content/${def.key}/${id}?error=${outcome}`);
};
