import type { AdminDb } from '../admin-auth';
import { isSameOrigin } from '../admin-auth';
import { readBodyLimited } from '../consultation';
import { SITE_FIELDS, SOCIAL_PLATFORMS } from './entities';
import { validateRefs } from './admin';
import {
  emptyValues,
  parseFields,
  valuesFromForm,
  valuesFromRow,
  type FieldErrors,
  type FormValues,
  type Row,
} from './fields';

// The site-wide details row (one row, id = true). The social links are stored as a list in one column but
// edited as one field per platform.

export async function loadSiteValues(
  db: AdminDb,
): Promise<{ values: FormValues; exists: boolean }> {
  const { data } = await db.from('site_settings').select('*').maybeSingle();
  if (!data) return { values: emptyValues(SITE_FIELDS), exists: false };

  const values = valuesFromRow(SITE_FIELDS, data as unknown as Row);
  const links = Array.isArray(data.social_links)
    ? (data.social_links as { platform?: string; url?: string }[])
    : [];
  for (const p of SOCIAL_PLATFORMS) {
    values[`social_${p}`] = links.find((l) => l.platform === p)?.url ?? '';
  }
  return { values, exists: true };
}

export type SitePostResult =
  | { redirect: Response }
  | { status: number; values: FormValues; errors: FieldErrors; formError?: string };

export async function processSitePost(request: Request, db: AdminDb): Promise<SitePostResult> {
  if (!isSameOrigin(request)) return { redirect: new Response('Forbidden', { status: 403 }) };
  const text = await readBodyLimited(request, 32 * 1024);
  if (text === null) return { redirect: new Response('Payload Too Large', { status: 413 }) };
  const form = new URLSearchParams(text);
  const values = valuesFromForm(SITE_FIELDS, form);

  const parsed = parseFields(SITE_FIELDS, form);
  if (!parsed.ok) return { status: 422, values, errors: parsed.errors };

  const refErrors = await validateRefs(db, SITE_FIELDS, parsed.value);
  if (Object.keys(refErrors).length > 0) return { status: 422, values, errors: refErrors };

  const row: Row = { ...parsed.value };
  const social: { platform: string; url: string }[] = [];
  for (const p of SOCIAL_PLATFORMS) {
    const url = row[`social_${p}`];
    delete row[`social_${p}`];
    if (typeof url === 'string' && url) social.push({ platform: p, url });
  }

  const { error } = await db
    .from('site_settings')
    .upsert(
      { ...(row as { site_name: string }), id: 1, social_links: social },
      { onConflict: 'id' },
    );
  if (error) {
    if (error.code === '23503') {
      return {
        status: 422,
        values,
        errors: { intro_video_id: 'This video no longer exists. Please choose again.' },
      };
    }
    console.error('site settings save failed', error.code);
    return { status: 500, values, errors: {}, formError: 'Could not save. Please try again.' };
  }
  return {
    redirect: new Response(null, { status: 303, headers: { location: '/admin/site?saved=1' } }),
  };
}
