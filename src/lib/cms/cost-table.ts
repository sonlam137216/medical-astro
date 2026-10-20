import type { FieldErrors, Row } from './fields';

// The price comparison tables ("Home: treatment costs table", "Dental Implants: cost comparison"). The admin lists
// the countries (the columns) and, in each treatment, one line per country: "Australia: A$1,250 | 40 clinics".
// Naming the country on each line keeps every price under its own country when a country is added, removed or
// moved, and an empty price cannot shift the next ones into the wrong column.

/** The field that lists the columns, and the one naming the country selected when the page opens. */
export const COUNTRIES_FIELD = 'countries';
export const COMPARE_FIELD = 'compare';
export const MAX_COUNTRIES = 8;

/** The columns before the admin could change them: rows saved then hold one price per country, in this order. */
export const LEGACY_COUNTRIES = [
  'Vietnam',
  'United States',
  'Australia',
  'United Kingdom',
  'Canada',
  'New Zealand',
];

export const sameCountry = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('en') === b.trim().toLocaleLowerCase('en');

/** "Australia: A$1,250 | 40 clinics" -> Australia + "A$1,250 | 40 clinics". Null without a "Country:" part. */
export function splitCell(line: string): { country: string; value: string } | null {
  const at = line.indexOf(':');
  if (at <= 0) return null;
  const country = line.slice(0, at).trim();
  if (country === '' || country.includes('|')) return null;
  return { country, value: line.slice(at + 1).trim() };
}

/** The price of one country in a treatment's lines, or '' when the treatment has none. */
export function cellFor(lines: readonly string[] | undefined, country: string): string {
  for (const line of lines ?? []) {
    const cell = splitCell(line);
    if (cell && sameCountry(cell.country, country)) return cell.value;
  }
  return '';
}

type Obj = Record<string, unknown>;

/**
 * A table saved before the countries could be edited: it gets the old fixed columns (compared with Australia, as
 * it was then), and each price is named after the country of its position. Rows saved since are left alone.
 */
export function upgradeCostTable(data: Obj): Obj {
  if (COUNTRIES_FIELD in data) return data;
  const out: Obj = {
    ...data,
    [COUNTRIES_FIELD]: [...LEGACY_COUNTRIES],
    [COMPARE_FIELD]: 'Australia',
  };
  if (Array.isArray(data.rows)) {
    out.rows = data.rows.map((row) => {
      if (typeof row !== 'object' || row === null || !Array.isArray((row as Obj).cells)) return row;
      const cells = ((row as Obj).cells as unknown[])
        .slice(0, LEGACY_COUNTRIES.length)
        .map((v, i) => (typeof v === 'string' && v.trim() ? `${LEGACY_COUNTRIES[i]}: ${v}` : ''))
        .filter((v) => v !== '');
      return { ...row, cells };
    });
  }
  return out;
}

/**
 * The checks that need more than one field: the countries are distinct, every price names one of them, and the
 * country selected when the page opens is one the visitor can compare with. Same rules for the form and Publish.
 */
export function costTableErrors(value: Row): FieldErrors {
  const errors: FieldErrors = {};
  const countries = Array.isArray(value[COUNTRIES_FIELD])
    ? (value[COUNTRIES_FIELD] as string[])
    : [];

  if (countries.length < 2) {
    errors[COUNTRIES_FIELD] =
      'List at least two countries: Vietnam first, then one or more to compare with.';
  } else if (countries.some((c) => /[:|]/.test(c))) {
    errors[COUNTRIES_FIELD] = 'A country name cannot contain “:” or “|”.';
  } else {
    const twice = countries.find((c, i) => countries.findIndex((o) => sameCountry(o, c)) !== i);
    if (twice) errors[COUNTRIES_FIELD] = `“${twice}” is listed twice.`;
  }

  const compare = typeof value[COMPARE_FIELD] === 'string' ? value[COMPARE_FIELD].trim() : '';
  if (compare && !countries.slice(1).some((c) => sameCountry(c, compare))) {
    errors[COMPARE_FIELD] = sameCountry(countries[0] ?? '', compare)
      ? `“${compare}” is the first column. Choose a country to compare it with.`
      : `“${compare}” is not in the Countries list.`;
  }

  const rows = Array.isArray(value.rows) ? (value.rows as Row[]) : [];
  rows.forEach((row, i) => {
    if (errors.rows) return;
    const name = typeof row.name === 'string' && row.name ? ` (“${row.name}”)` : '';
    const seen: string[] = [];
    for (const line of Array.isArray(row.cells) ? (row.cells as string[]) : []) {
      const cell = splitCell(line);
      if (!cell) {
        errors.rows = `Treatment ${i + 1}${name}: start each price with its country and a colon, for example “Australia: A$1,250 | 40 clinics”.`;
        return;
      }
      if (!countries.some((c) => sameCountry(c, cell.country))) {
        errors.rows = `Treatment ${i + 1}${name}: “${cell.country}” is not in the Countries list. Remove that line, or add the country to the list.`;
        return;
      }
      if (seen.some((c) => sameCountry(c, cell.country))) {
        errors.rows = `Treatment ${i + 1}${name}: “${cell.country}” has two prices. Keep one line per country.`;
        return;
      }
      seen.push(cell.country);
    }
  });
  return errors;
}
