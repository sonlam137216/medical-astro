import type { AdminDb } from './admin-auth';
import { isSameOrigin } from './admin-auth';
import { readBodyLimited } from './consultation';
import { parseDoctorForm, type DoctorErrors } from './doctors';

// Server side of the admin doctor form (create and edit share it). Pages call this for POST requests so
// that, when validation fails, the form is shown again with what the admin typed.

export interface DoctorFormValues {
  full_name: string;
  slug: string;
  role_title: string;
  bio: string;
  credentials: string; // one per line
  languages: string; // comma separated
  sort_order: string;
  is_visible: boolean;
}

export const EMPTY_DOCTOR: DoctorFormValues = {
  full_name: '',
  slug: '',
  role_title: '',
  bio: '',
  credentials: '',
  languages: 'English',
  sort_order: '0',
  is_visible: true,
};

type DoctorRow = {
  full_name: string;
  slug: string;
  role_title: string | null;
  bio: string | null;
  credentials: string[];
  languages: string[];
  sort_order: number;
  is_visible: boolean;
};

export function valuesFromRow(row: DoctorRow): DoctorFormValues {
  return {
    full_name: row.full_name,
    slug: row.slug,
    role_title: row.role_title ?? '',
    bio: row.bio ?? '',
    credentials: row.credentials.join('\n'),
    languages: row.languages.join(', '),
    sort_order: String(row.sort_order),
    is_visible: row.is_visible,
  };
}

function valuesFromForm(form: URLSearchParams): DoctorFormValues {
  const get = (name: string) => form.get(name) ?? '';
  return {
    full_name: get('full_name'),
    slug: get('slug'),
    role_title: get('role_title'),
    bio: get('bio'),
    credentials: get('credentials'),
    languages: get('languages'),
    sort_order: get('sort_order'),
    is_visible: form.has('is_visible'),
  };
}

export type DoctorPostResult =
  | { redirect: Response }
  | { status: number; values: DoctorFormValues; errors: DoctorErrors; formError?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

/** `id` is null when creating. */
export async function processDoctorPost(
  request: Request,
  db: AdminDb,
  id: string | null,
): Promise<DoctorPostResult> {
  if (!isSameOrigin(request)) return { redirect: new Response('Forbidden', { status: 403 }) };

  const text = await readBodyLimited(request, 32 * 1024);
  if (text === null) return { redirect: new Response('Payload Too Large', { status: 413 }) };
  const form = new URLSearchParams(text);
  const values = valuesFromForm(form);

  const parsed = parseDoctorForm(form);
  if (!parsed.ok) return { status: 422, values, errors: parsed.errors };

  const query =
    id === null
      ? db.from('doctors').insert(parsed.value).select('id')
      : db.from('doctors').update(parsed.value).eq('id', id).select('id');
  const { data, error } = await query;

  if (error) {
    if (error.code === '23505') {
      return {
        status: 422,
        values,
        errors: {
          slug: 'This address is already used by another doctor. Please choose a different one.',
        },
      };
    }
    console.error('doctor save failed', error.code);
    return { status: 500, values, errors: {}, formError: 'Could not save. Please try again.' };
  }
  if (!data || data.length === 0) {
    return { status: 404, values, errors: {}, formError: 'This doctor no longer exists.' };
  }

  return {
    redirect: new Response(null, { status: 303, headers: { location: '/admin/doctors?saved=1' } }),
  };
}
