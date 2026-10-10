import type { AdminDb } from '../admin-auth';
import { isSameOrigin } from '../admin-auth';
import { readBodyLimited } from '../consultation';
import { listPickerImages } from '../media-picker';
import { BUILTIN_PAGES } from './pages';
import { SECTION_DATA_VERSION, type SectionDef } from './sections';
import {
  emptyValues,
  parseFields,
  valuesFromForm,
  valuesFromRow,
  type Field,
  type FieldErrors,
  type FormValues,
  type Row,
} from './fields';
import type { FormOptions } from './admin';

// Server side of the "Page text" admin pages. One row of `page_sections` per section type. The section's own
// fields go into `data`; "Show this section" is the `is_visible` column. Table names are fixed here.

type AnyDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const anyDb = (db: AdminDb) => db as unknown as AnyDb;

/** The checkbox every section form has (not part of the stored `data`). */
export const VISIBLE_FIELD: Field = {
  type: 'bool',
  name: 'is_visible',
  label: 'Show this section on the website',
  default: true,
};

export type SectionState = 'builtin' | 'custom' | 'hidden';

/** Which sections have a row: `custom` (own text), `hidden` (switched off); the rest use the built-in text. */
export async function loadSectionStates(
  db: AdminDb,
): Promise<{ states: Map<string, SectionState>; failed: boolean }> {
  const { data, error } = await anyDb(db).from('page_sections').select('type, is_visible');
  const states = new Map<string, SectionState>();
  for (const r of (data ?? []) as { type: string; is_visible: boolean }[]) {
    states.set(r.type, r.is_visible ? 'custom' : 'hidden');
  }
  return { states, failed: Boolean(error) };
}

export interface LoadedSection {
  id: string | null;
  values: FormValues;
}

export async function loadSection(db: AdminDb, def: SectionDef): Promise<LoadedSection | null> {
  const { data: page } = await anyDb(db)
    .from('pages')
    .select('id')
    .eq('path', def.page)
    .maybeSingle();
  const empty = { id: null, values: { ...emptyValues(def.fields), is_visible: true } };
  if (!page) return empty;
  const { data: row, error } = await anyDb(db)
    .from('page_sections')
    .select('id, is_visible, data')
    .eq('page_id', page.id)
    .eq('type', def.key)
    .maybeSingle();
  if (error) return null;
  if (!row) return empty;
  return {
    id: row.id as string,
    values: {
      ...valuesFromRow(def.fields, (row.data ?? {}) as Row),
      is_visible: Boolean(row.is_visible),
    },
  };
}

export async function loadSectionOptions(db: AdminDb, def: SectionDef): Promise<FormOptions> {
  const images = def.fields.some((f) => f.type === 'image') ? await listPickerImages(db) : [];
  return { images, refs: {} };
}

export type SectionPostResult =
  | { redirect: Response }
  | { status: number; values: FormValues; errors: FieldErrors; formError?: string };

const redirectTo = (location: string) => new Response(null, { status: 303, headers: { location } });

/** Make sure the row of the page exists (the Pages list is only filled when somebody presses its button). */
async function ensurePage(db: AdminDb, path: string): Promise<string | null> {
  const found = await anyDb(db).from('pages').select('id').eq('path', path).maybeSingle();
  if (found.data) return found.data.id as string;
  const title = BUILTIN_PAGES.find((p) => p.path === path)?.title ?? path;
  const created = await anyDb(db).from('pages').insert({ path, title }).select('id');
  return (created.data?.[0]?.id as string | undefined) ?? null;
}

export async function processSectionPost(
  request: Request,
  db: AdminDb,
  def: SectionDef,
): Promise<SectionPostResult> {
  if (!isSameOrigin(request)) return { redirect: new Response('Forbidden', { status: 403 }) };
  const text = await readBodyLimited(request, 128 * 1024);
  if (text === null) return { redirect: new Response('Payload Too Large', { status: 413 }) };
  const form = new URLSearchParams(text);
  const values: FormValues = {
    ...valuesFromForm(def.fields, form),
    is_visible: form.has('is_visible'),
  };

  const parsed = parseFields(def.fields, form);
  if (!parsed.ok) return { status: 422, values, errors: parsed.errors };

  // A photo must be one of the active images of the library (a hand-made request could send any id).
  for (const f of def.fields) {
    const id = parsed.value[f.name];
    if (f.type !== 'image' || typeof id !== 'string') continue;
    const { data } = await anyDb(db)
      .from('media_assets')
      .select('id')
      .eq('id', id)
      .eq('kind', 'image')
      .eq('status', 'active')
      .maybeSingle();
    if (!data)
      return { status: 422, values, errors: { [f.name]: 'Please choose a photo from the list.' } };
  }

  const pageId = await ensurePage(db, def.page);
  if (!pageId) {
    return { status: 500, values, errors: {}, formError: 'Could not save. Please try again.' };
  }
  const existing = await anyDb(db)
    .from('page_sections')
    .select('id')
    .eq('page_id', pageId)
    .eq('type', def.key)
    .maybeSingle();
  const row = {
    is_visible: values.is_visible === true,
    data: parsed.value,
    data_version: SECTION_DATA_VERSION,
  };
  const { error } = existing.data
    ? await anyDb(db).from('page_sections').update(row).eq('id', existing.data.id)
    : await anyDb(db)
        .from('page_sections')
        .insert({ page_id: pageId, type: def.key, ...row });
  if (error) {
    console.error('page_sections save failed', error.code);
    const message =
      error.code === '23514'
        ? 'One of the values is not allowed. Please check the form.'
        : 'Could not save. Please try again.';
    return { status: error.code === '23514' ? 422 : 500, values, errors: {}, formError: message };
  }
  return { redirect: redirectTo('/admin/sections?saved=1') };
}

/** Go back to the built-in text: the row is removed. */
export async function resetSection(db: AdminDb, def: SectionDef): Promise<boolean> {
  const { data: page } = await anyDb(db)
    .from('pages')
    .select('id')
    .eq('path', def.page)
    .maybeSingle();
  if (!page) return true;
  const { error } = await anyDb(db)
    .from('page_sections')
    .delete()
    .eq('page_id', page.id)
    .eq('type', def.key);
  return !error;
}
