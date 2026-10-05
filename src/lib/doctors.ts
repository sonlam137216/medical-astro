// Validation for the admin doctor form. Pure functions, limits mirror the `doctors` table.

export interface DoctorValues {
  slug: string;
  full_name: string;
  role_title: string | null;
  bio: string | null;
  credentials: string[];
  languages: string[];
  sort_order: number;
  is_visible: boolean;
}

export type DoctorField =
  'full_name' | 'slug' | 'role_title' | 'bio' | 'credentials' | 'languages' | 'sort_order';
export type DoctorErrors = Partial<Record<DoctorField, string>>;

export const LIMITS = {
  name: 160,
  slug: 100,
  role: 160,
  bio: 4000,
  credentials: { count: 20, length: 300 },
  languages: { count: 10, length: 40 },
  sortOrder: 9999,
} as const;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/g; // keeps \n

/** 'Dr. Lê Thị Yến' -> 'dr-le-thi-yen' */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.slug)
    .replace(/-+$/, '');
}

// eslint-disable-next-line no-control-regex
const ONE_LINE_CONTROL = /[\u0000-\u001f\u007f]/g;
const oneLine = (v: string | null) =>
  (v ?? '').replace(ONE_LINE_CONTROL, ' ').replace(/\s+/g, ' ').trim();

function lines(value: string | null, split: RegExp): string[] {
  return (value ?? '')
    .split(split)
    .map(oneLine)
    .filter((l) => l !== '');
}

export function parseDoctorForm(
  form: URLSearchParams,
): { ok: true; value: DoctorValues } | { ok: false; errors: DoctorErrors } {
  const errors: DoctorErrors = {};

  const full_name = oneLine(form.get('full_name'));
  if (!full_name) errors.full_name = 'Please enter the doctor’s name.';
  else if (full_name.length > LIMITS.name)
    errors.full_name = `Keep the name under ${LIMITS.name} characters.`;

  const typedSlug = oneLine(form.get('slug')).toLowerCase();
  const slug = typedSlug || slugify(full_name);
  if (!slug || !SLUG_RE.test(slug) || slug.length > LIMITS.slug) {
    errors.slug = 'Use lowercase letters, numbers and single hyphens, for example dr-nguyen-van-a.';
  }

  const role_title = oneLine(form.get('role_title'));
  if (role_title.length > LIMITS.role)
    errors.role_title = `Keep the title under ${LIMITS.role} characters.`;

  const bio = (form.get('bio') ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, ' ').trim();
  if (bio.length > LIMITS.bio) errors.bio = `Keep the biography under ${LIMITS.bio} characters.`;

  const credentials = lines(form.get('credentials'), /\r?\n/);
  if (credentials.length > LIMITS.credentials.count) {
    errors.credentials = `Use at most ${LIMITS.credentials.count} lines.`;
  } else if (credentials.some((c) => c.length > LIMITS.credentials.length)) {
    errors.credentials = `Keep each line under ${LIMITS.credentials.length} characters.`;
  }

  const languages = [...new Set(lines(form.get('languages'), /[,\n]/))];
  if (languages.length > LIMITS.languages.count) {
    errors.languages = `Use at most ${LIMITS.languages.count} languages.`;
  } else if (languages.some((l) => l.length > LIMITS.languages.length)) {
    errors.languages = `Keep each language under ${LIMITS.languages.length} characters.`;
  }

  const rawOrder = oneLine(form.get('sort_order'));
  const sort_order = rawOrder === '' ? 0 : Number(rawOrder);
  if (!Number.isInteger(sort_order) || sort_order < 0 || sort_order > LIMITS.sortOrder) {
    errors.sort_order = `Use a whole number from 0 to ${LIMITS.sortOrder}.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      slug,
      full_name,
      role_title: role_title || null,
      bio: bio || null,
      credentials,
      languages: languages.length > 0 ? languages : ['English'],
      sort_order,
      is_visible: form.has('is_visible'),
    },
  };
}
