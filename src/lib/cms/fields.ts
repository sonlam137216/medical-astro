// Declarative field definitions for the admin content forms, and the parsing that goes with them.
// Pure code (no Worker or Node APIs, no relative imports) so it can be unit-tested with `node --test`.
// Limits mirror the CHECK constraints in the database; the database remains the last line of defence.

export interface FieldBase {
  name: string;
  label: string;
  help?: string;
  required?: boolean;
  /** Shown but never changed by the form (the saved value is kept). */
  readonly?: boolean;
}

export type Field =
  | (FieldBase & { type: 'text'; max: number; placeholder?: string })
  /** A link: a site path, #anchor, https/http URL, mailto: or tel: (same rule as the `link_href` domain). */
  | (FieldBase & { type: 'url'; max: number; placeholder?: string })
  | (FieldBase & { type: 'textarea'; max: number; rows?: number })
  /** An email address (same rule as the database check). */
  | (FieldBase & { type: 'email'; max: number })
  /** A web address starting with https:// or http:// (for example a social profile). */
  | (FieldBase & { type: 'weburl'; max: number; placeholder?: string })
  /** One item per line, stored as text[] */
  | (FieldBase & { type: 'lines'; maxItems: number; maxLength: number })
  /** Lowercase-hyphen key. Derived from the field named by `from` when left empty (if `from` is set). */
  | (FieldBase & { type: 'slug'; from?: string })
  /** A page address on this site, like /services/dental-implants (same rule as the `url_path` domain). */
  | (FieldBase & { type: 'path'; placeholder?: string })
  | (FieldBase & { type: 'int'; min: number; max: number; default: number })
  | (FieldBase & { type: 'bool'; default: boolean })
  | (FieldBase & {
      type: 'select';
      options: ReadonlyArray<readonly [string, string]>;
      default?: string;
    })
  | (FieldBase & { type: 'image' })
  /** One row of another table, chosen from a list. */
  | (FieldBase & { type: 'ref'; table: string; labelColumn: string })
  | (FieldBase & { type: 'date' })
  /** A price: `name` holds the amount, `currencyName` the 3-letter currency. */
  | (FieldBase & { type: 'money'; currencyName: string });

export type FieldType = Field['type'];

/** Form state: what was typed (strings), so a failed save can show the form again unchanged. */
export type FormValues = Record<string, string | boolean>;
export type FieldErrors = Record<string, string>;
export type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-control-regex
const CONTROL_ALL = /[\u0000-\u001f\u007f]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_KEEP_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

export const oneLine = (v: unknown): string =>
  (typeof v === 'string' ? v : '').replace(CONTROL_ALL, ' ').replace(/\s+/g, ' ').trim();

export const multiLine = (v: unknown): string =>
  (typeof v === 'string' ? v : '')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_KEEP_NEWLINE, ' ')
    .trim();

/** 'Dr. Lê Thị Yến' -> 'dr-le-thi-yen' */
export function slugify(text: string, max = 100): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Same rule as the database domain `link_href`: rejects javascript:, data: and other schemes. */
export const PATH_RE = /^\/([a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*)?$/;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const WEB_URL_RE = /^https?:\/\/[^\s]+$/i;
export const LINK_RE = /^(\/|#|https:\/\/|http:\/\/|mailto:|tel:)/;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
export type ParseResult = { ok: true; value: Row } | { ok: false; errors: FieldErrors };

function isRealDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

/** Turns submitted form data into database-shaped values, or one message per invalid field. */
export function parseFields(fields: readonly Field[], form: URLSearchParams): ParseResult {
  const errors: FieldErrors = {};
  const value: Row = {};
  const typed = (name: string) => form.get(name);

  for (const field of fields) {
    if (field.readonly) continue;
    const need = field.required ? `Please fill in “${field.label}”.` : null;

    switch (field.type) {
      case 'text': {
        const v = oneLine(typed(field.name));
        if (!v && need) errors[field.name] = need;
        else if (v.length > field.max)
          errors[field.name] = `Keep this under ${field.max} characters.`;
        value[field.name] = v || null;
        break;
      }
      case 'url': {
        const v = oneLine(typed(field.name));
        if (!v && need) errors[field.name] = need;
        else if (v && !LINK_RE.test(v)) {
          errors[field.name] =
            'Use a page address starting with /, a #section, or a link starting with https://, mailto: or tel:.';
        } else if (v.length > field.max)
          errors[field.name] = `Keep this under ${field.max} characters.`;
        value[field.name] = v || null;
        break;
      }
      case 'email': {
        const v = oneLine(typed(field.name));
        if (!v && need) errors[field.name] = need;
        else if (v && (!EMAIL_RE.test(v) || v.length > field.max))
          errors[field.name] = 'Please enter a valid email address.';
        value[field.name] = v || null;
        break;
      }
      case 'weburl': {
        const v = oneLine(typed(field.name));
        if (!v && need) errors[field.name] = need;
        else if (v && (!WEB_URL_RE.test(v) || v.length > field.max))
          errors[field.name] = 'Use a full web address starting with https://.';
        value[field.name] = v || null;
        break;
      }
      case 'textarea': {
        const v = multiLine(typed(field.name));
        if (!v && need) errors[field.name] = need;
        else if (v.length > field.max)
          errors[field.name] = `Keep this under ${field.max} characters.`;
        value[field.name] = v || null;
        break;
      }
      case 'lines': {
        const items = (typed(field.name) ?? '')
          .split(/\r?\n/)
          .map(oneLine)
          .filter((l) => l !== '');
        if (items.length === 0 && need) errors[field.name] = need;
        else if (items.length > field.maxItems)
          errors[field.name] = `Use at most ${field.maxItems} lines.`;
        else if (items.some((l) => l.length > field.maxLength)) {
          errors[field.name] = `Keep each line under ${field.maxLength} characters.`;
        }
        value[field.name] = items;
        break;
      }
      case 'slug': {
        const base = field.from ? oneLine(typed(field.from)) : '';
        const slug = oneLine(typed(field.name)).toLowerCase() || slugify(base);
        if (!slug || !SLUG_RE.test(slug) || slug.length > 100) {
          errors[field.name] =
            'Use lowercase letters, numbers and single hyphens, for example dental-implants.';
        }
        value[field.name] = slug;
        break;
      }
      case 'path': {
        const v = oneLine(typed(field.name)).toLowerCase();
        if (!v && need) errors[field.name] = need;
        else if (v && (!PATH_RE.test(v) || v.length > 200)) {
          errors[field.name] =
            'Use lowercase letters, numbers and hyphens, starting with /, for example /old-page.';
        }
        value[field.name] = v || null;
        break;
      }
      case 'int': {
        const raw = oneLine(typed(field.name));
        const n = raw === '' ? field.default : Number(raw);
        if (!Number.isInteger(n) || n < field.min || n > field.max) {
          errors[field.name] = `Use a whole number from ${field.min} to ${field.max}.`;
        }
        value[field.name] = n;
        break;
      }
      case 'bool':
        value[field.name] = form.has(field.name);
        break;
      case 'select': {
        const v = oneLine(typed(field.name)) || field.default || '';
        if (!field.options.some(([key]) => key === v))
          errors[field.name] = 'Please choose one of the options.';
        value[field.name] = v;
        break;
      }
      case 'image':
      case 'ref': {
        const v = oneLine(typed(field.name));
        if (!v && need) errors[field.name] = need;
        else if (v && !UUID_RE.test(v)) errors[field.name] = 'Please choose an item from the list.';
        value[field.name] = v ? v.toLowerCase() : null;
        break;
      }
      case 'date': {
        const v = oneLine(typed(field.name));
        if (!v && need) errors[field.name] = need;
        else if (v && !isRealDate(v)) errors[field.name] = 'Use a date like 2026-10-05.';
        value[field.name] = v || null;
        break;
      }
      case 'money': {
        const rawAmount = oneLine(typed(field.name)).replace(/,/g, '');
        const currency = oneLine(typed(field.currencyName)).toUpperCase();
        if (rawAmount === '') {
          value[field.name] = null;
          value[field.currencyName] = null;
          break;
        }
        const amount = Number(rawAmount);
        if (
          !Number.isFinite(amount) ||
          amount < 0 ||
          amount > 9_999_999_999.99 ||
          !/^\d+(\.\d{1,2})?$/.test(rawAmount)
        ) {
          errors[field.name] = 'Use an amount like 600 or 1250.50.';
        } else if (!/^[A-Z]{3}$/.test(currency)) {
          errors[field.name] = 'Add a 3-letter currency such as USD.';
        }
        value[field.name] = amount;
        value[field.currencyName] = currency || null;
        break;
      }
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------
export function emptyValues(fields: readonly Field[]): FormValues {
  const values: FormValues = {};
  for (const f of fields) {
    switch (f.type) {
      case 'bool':
        values[f.name] = f.default;
        break;
      case 'int':
        values[f.name] = String(f.default);
        break;
      case 'select':
        values[f.name] = f.default ?? f.options[0]?.[0] ?? '';
        break;
      case 'money':
        values[f.name] = '';
        values[f.currencyName] = 'USD';
        break;
      default:
        values[f.name] = '';
    }
  }
  return values;
}

/** Row from the database -> what the form shows. */
export function valuesFromRow(fields: readonly Field[], row: Row): FormValues {
  const values = emptyValues(fields);
  for (const f of fields) {
    const v = row[f.name];
    switch (f.type) {
      case 'bool':
        values[f.name] = Boolean(v);
        break;
      case 'lines':
        values[f.name] = Array.isArray(v) ? v.join('\n') : '';
        break;
      case 'money':
        values[f.name] = v === null || v === undefined ? '' : String(v);
        values[f.currencyName] =
          typeof row[f.currencyName] === 'string' ? (row[f.currencyName] as string) : 'USD';
        break;
      default:
        values[f.name] = v === null || v === undefined ? '' : String(v);
    }
  }
  return values;
}

/** What was submitted -> form state (for showing the form again after an error). */
export function valuesFromForm(fields: readonly Field[], form: URLSearchParams): FormValues {
  const values = emptyValues(fields);
  for (const f of fields) {
    if (f.type === 'bool') values[f.name] = form.has(f.name);
    else if (f.type === 'money') {
      values[f.name] = form.get(f.name) ?? '';
      values[f.currencyName] = form.get(f.currencyName) ?? 'USD';
    } else values[f.name] = form.get(f.name) ?? '';
  }
  return values;
}
