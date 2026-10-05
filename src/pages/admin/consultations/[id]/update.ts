import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../lib/admin-auth';
import { readBodyLimited } from '../../../../lib/consultation';

export const prerender = false;

const STATUSES = ['new', 'in_progress', 'done', 'spam'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });

  const id = params.id ?? '';
  if (!UUID_RE.test(id)) return new Response('Not found', { status: 404 });
  const to = (query: string) =>
    new Response(null, {
      status: 303,
      headers: { location: `/admin/consultations/${id}?${query}` },
    });

  const text = await readBodyLimited(request, 8 * 1024);
  if (text === null) return new Response('Payload Too Large', { status: 413 });
  const form = new URLSearchParams(text);

  const status = form.get('status') ?? '';
  // Notes may be multi-line, so only trim and bound them (the column allows 2000 characters).
  const note = (form.get('internal_note') ?? '').replace(/\r\n/g, '\n').trim();
  if (!STATUSES.includes(status) || note.length > 2000) return to('error=1');

  // Only the handling fields are ever written: the contact details a visitor submitted cannot be edited.
  // Who handled it, and when, is recorded only when the status actually changes.
  const { data: current } = await locals.db
    .from('consultation_requests')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!current) return to('error=1');
  const stamp =
    current.status === status
      ? {}
      : { handled_by: locals.admin.id, handled_at: new Date().toISOString() };

  const { data, error } = await locals.db
    .from('consultation_requests')
    .update({ status, internal_note: note === '' ? null : note, ...stamp })
    .eq('id', id)
    .select('id');

  if (error || !data || data.length === 0) {
    // Code only: error messages can echo row data, which is personal data.
    if (error) console.error('consultation update failed', error.code);
    return to('error=1');
  }
  return to('saved=1');
};
