import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../lib/admin-auth';
import { readBodyLimited } from '../../../../lib/consultation';
import { toFocus } from '../../../../lib/image-slots';

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sets (x and y, whole percent 0-100) or clears (`clear`) the focus point of an image: the part that stays in
// view when a page crops the picture. A plain form post from the media page, or fetch() from the picture field
// of a form (which asks for JSON). Takes effect on the website after the next Publish.
export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const id = params.id ?? '';
  if (!UUID_RE.test(id)) return new Response('Not found', { status: 404 });
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const reply = (status: number, body: { ok: boolean; error?: string }) =>
    wantsJson
      ? new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        })
      : new Response(null, {
          status: 303,
          headers: { location: `/admin/media/${id}?${body.ok ? 'focus=1' : 'error=focus'}` },
        });

  const text = await readBodyLimited(request, 1024);
  if (text === null) return new Response('Payload Too Large', { status: 413 });
  const form = new URLSearchParams(text);

  let x: number | null = null;
  let y: number | null = null;
  if (!form.has('clear')) {
    const focus = toFocus(Number(form.get('x') ?? 'NaN'), Number(form.get('y') ?? 'NaN'));
    if (!focus) return reply(422, { ok: false, error: 'Choose a point inside the picture.' });
    x = focus.x;
    y = focus.y;
  }

  const { data: asset } = await locals.db
    .from('media_assets')
    .select('id')
    .eq('id', id)
    .eq('kind', 'image')
    .maybeSingle();
  if (!asset) return new Response('Not found', { status: 404 });

  const { error } = await locals.db
    .from('media_assets')
    .update({ focal_x: x, focal_y: y })
    .eq('id', id);
  if (error) {
    console.error('media focus failed', error.code);
    return reply(500, { ok: false, error: 'Could not save. Please try again.' });
  }
  return reply(200, { ok: true });
};
