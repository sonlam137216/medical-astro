import type { AdminDb } from '../admin-auth';
import { isSameOrigin } from '../admin-auth';
import { readBodyLimited } from '../consultation';
import { listPickerImages, type PickerImage } from '../media-picker';
import { articleProblems } from './articles';
import type { EntityDef } from './entities';
import {
  emptyValues,
  parseFields,
  valuesFromForm,
  valuesFromRow,
  type FieldErrors,
  type FormValues,
  type Row,
} from './fields';

// Server side of the generic admin content pages. The table name comes from the registry (never from the
// request), so the dynamic `from(table)` call below cannot be steered by a visitor.

// The generated database types are per table; the generic pages work on any registered table.
type AnyDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const anyDb = (db: AdminDb) => db as unknown as AnyDb;

export interface Option {
  value: string;
  label: string;
}
export interface FormOptions {
  images: PickerImage[];
  refs: Record<string, Option[]>;
}

/** Choices for the image picker and for `ref` fields. */
export async function loadOptions(db: AdminDb, def: EntityDef): Promise<FormOptions> {
  const needsImages = def.fields.some((f) => f.type === 'image');
  const images = needsImages ? await listPickerImages(db) : [];
  const refs: Record<string, Option[]> = {};
  for (const f of def.fields) {
    if (f.type !== 'ref') continue;
    const { data } = await anyDb(db)
      .from(f.table)
      .select(`id, ${f.labelColumn}`)
      .order(f.labelColumn);
    refs[f.name] = ((data ?? []) as Row[]).map((r) => ({
      value: String(r.id),
      label: String(r[f.labelColumn]),
    }));
  }
  return { images, refs };
}

export type PostResult =
  | { redirect: Response }
  | { status: number; values: FormValues; errors: FieldErrors; formError?: string };

export const redirectTo = (location: string) =>
  new Response(null, { status: 303, headers: { location } });

/** Create (`id` null) or update from a submitted form. */
export async function processPost(
  request: Request,
  db: AdminDb,
  def: EntityDef,
  id: string | null,
): Promise<PostResult> {
  if (!isSameOrigin(request)) return { redirect: new Response('Forbidden', { status: 403 }) };

  // An article body of 60,000 characters grows when URL-encoded (accents, spaces), so articles get more room.
  const text = await readBodyLimited(request, def.key === 'articles' ? 320 * 1024 : 64 * 1024);
  if (text === null) return { redirect: new Response('Payload Too Large', { status: 413 }) };
  const form = new URLSearchParams(text);
  const values = valuesFromForm(def.fields, form);

  const parsed = parseFields(def.fields, form);
  if (!parsed.ok) return { status: 422, values, errors: parsed.errors };

  if (def.key === 'articles') {
    const errors = await checkArticle(db, parsed.value);
    if (Object.keys(errors).length > 0) return { status: 422, values, errors };
  }

  // `status_code` is the only numeric select; the column is an integer.
  const row: Row = { ...parsed.value };
  if (typeof row.status_code === 'string') row.status_code = Number(row.status_code);

  const table = anyDb(db).from(def.table);
  const { data, error } = await (id === null
    ? table.insert(row).select('id')
    : table.update(row).eq('id', id).select('id'));

  if (error) {
    const slugField = def.fields.find((f) => f.type === 'slug');
    if (error.code === '23505') {
      return {
        status: 422,
        values,
        errors: slugField
          ? { [slugField.name]: 'This address is already used. Please choose a different one.' }
          : {},
        formError: slugField ? undefined : 'An item with these details already exists.',
      };
    }
    if (error.code === '23503') {
      return {
        status: 422,
        values,
        errors: {},
        formError: 'A chosen photo or related item no longer exists. Please choose again.',
      };
    }
    if (error.code === '23514') {
      return {
        status: 422,
        values,
        errors: {},
        formError: 'One of the values is not allowed. Please check the form.',
      };
    }
    // Codes only: error text can echo what was typed.
    console.error(`${def.table} save failed`, error.code);
    return { status: 500, values, errors: {}, formError: 'Could not save. Please try again.' };
  }
  if (!data || data.length === 0) {
    return { status: 404, values, errors: {}, formError: 'This item no longer exists.' };
  }
  return { redirect: redirectTo(`/admin/content/${def.key}?saved=1`) };
}

/** Rules that span fields or tables (see articleProblems), run before an article is saved. */
async function checkArticle(db: AdminDb, value: Row): Promise<FieldErrors> {
  let categoryKind: string | null = null;
  if (typeof value.category_id === 'string') {
    const { data } = await anyDb(db)
      .from('article_categories')
      .select('kind')
      .eq('id', value.category_id)
      .maybeSingle();
    categoryKind = (data as { kind?: string } | null)?.kind ?? null;
    if (!categoryKind)
      return { category_id: 'This category no longer exists. Please choose again.' };
  }
  return articleProblems({
    kind: String(value.kind ?? ''),
    isVisible: value.is_visible === true,
    title: String(value.title ?? ''),
    excerpt: (value.excerpt as string | null) ?? null,
    body: (value.body as string | null) ?? null,
    publishedOn: (value.published_on as string | null) ?? null,
    reviewedBy: (value.reviewed_by as string | null) ?? null,
    categoryKind,
    today: new Date().toISOString().slice(0, 10),
  });
}

export async function loadRow(db: AdminDb, def: EntityDef, id: string): Promise<Row | null> {
  const { data } = await anyDb(db).from(def.table).select('*').eq('id', id).maybeSingle();
  return (data as Row | null) ?? null;
}

export async function listRows(
  db: AdminDb,
  def: EntityDef,
): Promise<{ rows: Row[]; failed: boolean }> {
  let query = anyDb(db).from(def.table).select('*');
  for (const o of def.order) query = query.order(o.column, { ascending: o.ascending ?? true });
  const { data, error } = await query.limit(500);
  return { rows: (data ?? []) as Row[], failed: Boolean(error) };
}

export async function deleteRow(
  db: AdminDb,
  def: EntityDef,
  id: string,
): Promise<'ok' | 'in_use' | 'failed'> {
  const { error } = await anyDb(db).from(def.table).delete().eq('id', id);
  if (!error) return 'ok';
  if (error.code === '23503') return 'in_use';
  console.error(`${def.table} delete failed`, error.code);
  return 'failed';
}

export { emptyValues, valuesFromRow };
