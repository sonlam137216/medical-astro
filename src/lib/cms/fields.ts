// Declarative field definitions for the admin content forms, and the parsing that goes with them.
// Pure code (no Worker or Node APIs, no relative imports) so it can be unit-tested with `node --test`.
// Limits mirror the CHECK constraints in the database; the database remains the last line of defence.

import type { SlotKey } from '../image-slots.ts';
import { parseVideoUrl } from '../video-embed.ts';

export interface FieldBase {
  name: string;
  label: string;
  help?: string;
  required?: boolean;
  /** Shown but never changed by the form (the saved value is kept). */
  readonly?: boolean;
  /** Admin form only: a heading drawn above the first field of each group. */
  group?: string;
  /** Admin form only: the field takes half the width, so two in a row sit side by side. */
  half?: boolean;
}

/**
 * One column of an `items` field. `lines` values are stored as an array of text; `choice` is one of `options`
 * (stored as its value, empty for none); `video` is a YouTube or Vimeo link (src/lib/video-embed.ts); `prices`
 * is one price per country of the `lines` field named by `countriesFrom`, stored as CountryPrice[] in the order
 * of that list (the cost tables: src/lib/cms/cost-table.ts).
 */
export interface ItemColumn {
  name: string;
  label: string;
  kind: 'text' | 'textarea' | 'lines' | 'choice' | 'video' | 'prices';
  max: number;
  required?: boolean;
  help?: string;
  /** `choice` only: the allowed values and their names in the admin. */
  options?: readonly { value: string; label: string }[];
  /** `prices` only: the `lines` field that lists the countries. */
  countriesFrom?: string;
}

/** One country of a `prices` column. `saving` is empty for the first country (the one the others compare with). */
export interface CountryPrice {
  country: string;
  price: string;
  /** The small line under the price, for example "40 clinics". */
  detail: string;
  saving: string;
}

/** The parts of a `prices` entry and their length limits. */
export const PRICE_PARTS = { price: 40, detail: 60, saving: 40 } as const;
export type PricePart = 'country' | keyof typeof PRICE_PARTS;

export type Field =
  /**
   * `choicesFrom`: shown as a list of the lines of that field except the first (the countries a cost table is
   * compared with), plus an empty choice named `emptyLabel`. Stored as text like any other text field.
   */
  | (FieldBase & {
      type: 'text';
      max: number;
      placeholder?: string;
      choicesFrom?: { field: string; emptyLabel: string };
    })
  /** A link: a site path, #anchor, https/http URL, mailto: or tel: (same rule as the `link_href` domain). */
  | (FieldBase & { type: 'url'; max: number; placeholder?: string })
  /**
   * `editor`: the article writing tools (toolbar, preview) are drawn around it. `'article'` also has the picture
   * button (pictures from Media); `'text'` is the same without pictures (legal pages).
   */
  | (FieldBase & { type: 'textarea'; max: number; rows?: number; editor?: 'article' | 'text' })
  /** An email address (same rule as the database check). */
  | (FieldBase & { type: 'email'; max: number })
  /** A web address starting with https:// or http:// (for example a social profile). */
  | (FieldBase & { type: 'weburl'; max: number; placeholder?: string })
  /** One item per line, stored as text[]. `inputs`: the form shows one box per item instead of a text area. */
  | (FieldBase & { type: 'lines'; maxItems: number; maxLength: number; inputs?: boolean })
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
  /** `slot`: the place on the website that shows the picture (src/lib/image-slots.ts): sizes and crop hints. */
  | (FieldBase & { type: 'image'; slot?: SlotKey })
  /** One row of another table, chosen from a list. */
  | (FieldBase & {
      type: 'ref';
      table: string;
      labelColumn: string;
      /** Only rows whose columns equal these values are offered (e.g. videos among all media). */
      where?: Record<string, string>;
    })
  | (FieldBase & { type: 'date' })
  /** A price: `name` holds the amount, `currencyName` the 3-letter currency. */
  | (FieldBase & { type: 'money'; currencyName: string })
  /**
   * A short list of cards or rows, each with the same columns; stored as an array of objects. The form shows
   * `maxItems` slots (so it works without JavaScript); a slot with nothing in it is left out.
   */
  | (FieldBase & {
      type: 'items';
      maxItems: number;
      itemLabel: string;
      columns: ItemColumn[];
    });

/** Name of one input of an `items` slot in the submitted form. */
export const itemInput = (field: string, index: number, column: string) =>
  `${field}__${index}__${column}`;

/** Name of one box of a `prices` column: the `j`th country of item `index`. */
export const priceInput = (
  field: string,
  index: number,
  column: string,
  j: number,
  part: PricePart,
) => `${itemInput(field, index, column)}__${j}__${part}`;

/** Most countries a `prices` column reads from a form (the countries list allows fewer). */
const MAX_PRICE_ROWS = 16;

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

/** The lines of a `lines` field: one text area, or one box per line (`inputs`), so every value is read. */
const linesOf = (form: URLSearchParams, name: string): string[] =>
  form
    .getAll(name)
    .join('\n')
    .split(/\r?\n/)
    .map(oneLine)
    .filter((l) => l !== '');

/** The boxes of one `prices` cell as typed (nothing checked yet). */
function readPriceInputs(
  form: URLSearchParams,
  field: string,
  index: number,
  column: string,
): CountryPrice[] {
  const out: CountryPrice[] = [];
  for (let j = 0; j < MAX_PRICE_ROWS; j++) {
    const get = (part: PricePart) => form.get(priceInput(field, index, column, j, part));
    if (get('country') === null) continue;
    out.push({
      country: oneLine(get('country')),
      price: oneLine(get('price')),
      detail: oneLine(get('detail')),
      saving: oneLine(get('saving')),
    });
  }
  return out;
}

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('en') === b.trim().toLocaleLowerCase('en');

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
// A page address starts with one "/": browsers read "//host" and "/\host" as a link to another site.
export const LINK_RE = /^(\/(?![/\\])|#|https:\/\/|http:\/\/|mailto:|tel:)/;

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
        const items = linesOf(form, field.name);
        if (items.length === 0 && need) errors[field.name] = need;
        else if (items.length > field.maxItems)
          errors[field.name] = `Use at most ${field.maxItems} lines.`;
        else if (items.some((l) => l.length > field.maxLength)) {
          errors[field.name] = `Keep each line under ${field.maxLength} characters.`;
        }
        value[field.name] = items;
        break;
      }
      case 'items': {
        const items: Row[] = [];
        for (let i = 0; i < field.maxItems; i++) {
          const item: Row = {};
          let filled = false;
          for (const c of field.columns) {
            const raw = typed(itemInput(field.name, i, c.name)) ?? '';
            if (c.kind === 'lines') {
              const lines = raw
                .split(/\r?\n/)
                .map(oneLine)
                .filter((l) => l !== '');
              if (lines.some((l) => l.length > c.max)) {
                errors[field.name] =
                  `${field.itemLabel} ${i + 1}: keep each line of “${c.label}” under ${c.max} characters.`;
              }
              if (lines.length > 0) filled = true;
              item[c.name] = lines;
            } else if (c.kind === 'prices') {
              // One entry per country of the list, in its order. A country no longer in the list (removed
              // without JavaScript) is left out; the first country is not compared, so it has no saving.
              const countries = c.countriesFrom ? linesOf(form, c.countriesFrom) : [];
              const typedPrices = readPriceInputs(form, field.name, i, c.name);
              const entries: CountryPrice[] = [];
              countries.forEach((country, j) => {
                const p = typedPrices.find((t) => sameName(t.country, country));
                if (!p) return;
                const entry = { ...p, country, saving: j === 0 ? '' : p.saving };
                if (!entry.price && !entry.detail && !entry.saving) return;
                for (const part of ['price', 'detail', 'saving'] as const) {
                  if (entry[part].length > PRICE_PARTS[part]) {
                    errors[field.name] =
                      `${field.itemLabel} ${i + 1}, ${country}: keep the ${part} under ${PRICE_PARTS[part]} characters.`;
                  }
                }
                if (!entry.price) {
                  errors[field.name] =
                    `${field.itemLabel} ${i + 1}, ${country}: add the price, or clear the other boxes of that country.`;
                }
                entries.push(entry);
              });
              if (entries.length > 0) filled = true;
              item[c.name] = entries;
            } else if (c.kind === 'choice') {
              const v = oneLine(raw);
              if (v !== '' && !c.options?.some((o) => o.value === v)) {
                errors[field.name] =
                  `${field.itemLabel} ${i + 1}: choose “${c.label}” from the list.`;
              }
              // A choice alone does not make a card: an empty card keeps its list on "None".
              item[c.name] = v;
            } else {
              const v = c.kind === 'textarea' ? multiLine(raw) : oneLine(raw);
              if (v.length > c.max) {
                errors[field.name] =
                  `${field.itemLabel} ${i + 1}: keep “${c.label}” under ${c.max} characters.`;
              } else if (c.kind === 'video' && v !== '' && !parseVideoUrl(v)) {
                errors[field.name] =
                  `${field.itemLabel} ${i + 1}: “${c.label}” must be a YouTube or Vimeo link, for example https://www.youtube.com/watch?v=…`;
              }
              if (v !== '') filled = true;
              item[c.name] = v;
            }
          }
          if (!filled) continue;
          for (const c of field.columns) {
            const v = item[c.name];
            if (c.required && (Array.isArray(v) ? v.length === 0 : v === '')) {
              errors[field.name] = `${field.itemLabel} ${i + 1}: please fill in “${c.label}”.`;
            }
          }
          items.push(item);
        }
        if (items.length === 0 && field.required)
          errors[field.name] = `Please add at least one ${field.itemLabel.toLowerCase()}.`;
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
      case 'items':
        for (let i = 0; i < f.maxItems; i++)
          for (const c of f.columns) values[itemInput(f.name, i, c.name)] = '';
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
      case 'items':
        (Array.isArray(v) ? (v as Row[]) : []).slice(0, f.maxItems).forEach((item, i) => {
          for (const c of f.columns) {
            const cell = item?.[c.name];
            if (c.kind === 'prices') {
              values[itemInput(f.name, i, c.name)] =
                Array.isArray(cell) && cell.length > 0 ? JSON.stringify(cell) : '';
              continue;
            }
            values[itemInput(f.name, i, c.name)] = Array.isArray(cell)
              ? cell.join('\n')
              : typeof cell === 'string'
                ? cell
                : '';
          }
        });
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
    else if (f.type === 'lines') values[f.name] = linesOf(form, f.name).join('\n');
    else if (f.type === 'items') {
      for (let i = 0; i < f.maxItems; i++)
        for (const c of f.columns) {
          const key = itemInput(f.name, i, c.name);
          if (c.kind === 'prices') {
            const typedPrices = readPriceInputs(form, f.name, i, c.name).filter(
              (p) => p.price || p.detail || p.saving,
            );
            values[key] = typedPrices.length > 0 ? JSON.stringify(typedPrices) : '';
          } else values[key] = form.get(key) ?? '';
        }
    } else if (f.type === 'money') {
      values[f.name] = form.get(f.name) ?? '';
      values[f.currencyName] = form.get(f.currencyName) ?? 'USD';
    } else values[f.name] = form.get(f.name) ?? '';
  }
  return values;
}

/** The prices of a `prices` cell in the form state (JSON, see valuesFromRow), or none. */
export function pricesFromValue(value: unknown): CountryPrice[] {
  if (typeof value !== 'string' || value === '') return [];
  try {
    const list = JSON.parse(value) as unknown;
    return Array.isArray(list) ? (list as CountryPrice[]) : [];
  } catch {
    return [];
  }
}

/** Stored data -> the form it was saved from, so stored data can go back through parseFields (Publish). */
export function formFromData(fields: readonly Field[], data: Row): URLSearchParams {
  const form = new URLSearchParams();
  for (const f of fields) {
    const v = data[f.name];
    if (f.type === 'lines' && Array.isArray(v)) form.set(f.name, v.join('\n'));
    else if (f.type === 'items' && Array.isArray(v)) {
      (v as Row[]).slice(0, f.maxItems).forEach((item, i) => {
        for (const c of f.columns) {
          const cell = item?.[c.name];
          if (c.kind === 'prices') {
            (Array.isArray(cell) ? (cell as Partial<CountryPrice>[]) : []).forEach((p, j) => {
              for (const part of ['country', 'price', 'detail', 'saving'] as const)
                form.set(priceInput(f.name, i, c.name, j, part), String(p?.[part] ?? ''));
            });
            continue;
          }
          form.set(
            itemInput(f.name, i, c.name),
            Array.isArray(cell) ? cell.join('\n') : typeof cell === 'string' ? cell : '',
          );
        }
      });
    } else if (typeof v === 'string') form.set(f.name, v);
  }
  return form;
}
