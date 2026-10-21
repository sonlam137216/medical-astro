import type { CountryPrice, FieldErrors, Row } from './fields';

// The price comparison tables ("Home: treatment costs table", "Dental Implants: cost comparison"). The admin lists
// the countries (the columns) and each treatment has one price, a line under it and a saving per country
// (a `prices` column, src/lib/cms/fields.ts). Prices are kept with their country's name, so a price stays under
// its own country when a country is added, removed or moved.

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

/** The price of one country in a treatment, or undefined when it has none. */
export function priceFor(
  prices: readonly CountryPrice[] | undefined,
  country: string,
): CountryPrice | undefined {
  return (prices ?? []).find((p) => sameCountry(p.country, country) && p.price !== '');
}

/** "US$1,250" -> US$ + 1250; "1.250 €" -> € + 1250 (a dot before three digits is a thousands mark). */
function readAmount(price: string): { unit: string; amount: number } | null {
  const m = /^([^\d\s]*)\s*(\d{1,3}(?:[,.]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*([^\d\s]*)$/.exec(
    price.trim(),
  );
  if (!m) return null;
  const amount = Number(m[2].replace(/[,.]/g, '') + (m[3] ? `.${m[3]}` : ''));
  const unit = `${m[1]}|${m[4]}`.toLocaleLowerCase('en');
  return Number.isFinite(amount) && amount > 0 ? { unit, amount } : null;
}

/**
 * The saving the admin is offered for a country ("73%"): how much less the first country's price is, rounded
 * down. Only when both prices are a single amount in the same currency, and the first one is cheaper.
 */
export function suggestedSaving(firstPrice: string, otherPrice: string): string {
  const a = readAmount(firstPrice);
  const b = readAmount(otherPrice);
  if (!a || !b || a.unit !== b.unit || a.amount >= b.amount) return '';
  const percent = Math.floor((1 - a.amount / b.amount) * 100);
  return percent > 0 ? `${percent}%` : '';
}

type Obj = Record<string, unknown>;

/** "A$1,250 | 40 clinics" (a price line of a table saved before the price boxes) -> price and line under it. */
function splitValue(value: string): { price: string; detail: string } {
  const [price = '', ...rest] = value.split(/\s*\|\s*/);
  return { price: price.trim(), detail: rest.join(' | ').trim() };
}

/**
 * Brings a saved table up to the current fields, step by step:
 * - saved before the countries could be edited: it gets the old fixed columns (compared with Australia, as it was
 *   then), and each price is named after the country of its position;
 * - saved with one price line per country ("Australia: A$1,250 | 40 clinics") and one saving per treatment:
 *   each line becomes the price boxes of its country, and the treatment's saving goes to every compared country
 *   that has a price (the page showed that saving whichever country was chosen).
 * Rows saved since are left alone (the same object is returned).
 */
export function upgradeCostTable(data: Obj): Obj {
  let out = data;
  if (!(COUNTRIES_FIELD in out)) {
    out = {
      ...out,
      [COUNTRIES_FIELD]: [...LEGACY_COUNTRIES],
      [COMPARE_FIELD]: 'Australia',
    };
    if (Array.isArray(data.rows)) {
      out.rows = data.rows.map((row) => {
        if (typeof row !== 'object' || row === null || !Array.isArray((row as Obj).cells))
          return row;
        const cells = ((row as Obj).cells as unknown[])
          .slice(0, LEGACY_COUNTRIES.length)
          .map((v, i) => (typeof v === 'string' && v.trim() ? `${LEGACY_COUNTRIES[i]}: ${v}` : ''))
          .filter((v) => v !== '');
        return { ...row, cells };
      });
    }
  }
  const rows = Array.isArray(out.rows) ? (out.rows as unknown[]) : [];
  const isOld = (row: unknown): row is Obj =>
    typeof row === 'object' && row !== null && !('prices' in row) && 'cells' in row;
  if (!rows.some(isOld)) return out;

  const countries = Array.isArray(out[COUNTRIES_FIELD]) ? (out[COUNTRIES_FIELD] as string[]) : [];
  const first = countries[0] ?? '';
  return {
    ...out,
    rows: rows.map((row) => {
      if (!isOld(row)) return row;
      const { cells, saving, ...rest } = row;
      const oldSaving = typeof saving === 'string' ? saving.trim() : '';
      const prices: CountryPrice[] = [];
      for (const line of Array.isArray(cells) ? cells : []) {
        const cell = typeof line === 'string' ? splitCell(line) : null;
        if (!cell) continue;
        const { price, detail } = splitValue(cell.value);
        if (!price) continue;
        const compared = !sameCountry(cell.country, first);
        prices.push({ country: cell.country, price, detail, saving: compared ? oldSaving : '' });
      }
      return { ...rest, prices };
    }),
  };
}

/**
 * The checks that need more than one field: the countries are distinct, and the country selected when the page
 * opens is one the visitor can compare with. Same rules for the form and Publish. (The price boxes are checked
 * with the form, which keeps only the countries of the list.)
 */
export function costTableErrors(value: Row): FieldErrors {
  const errors: FieldErrors = {};
  const countries = Array.isArray(value[COUNTRIES_FIELD])
    ? (value[COUNTRIES_FIELD] as string[])
    : [];

  if (countries.length < 2) {
    errors[COUNTRIES_FIELD] =
      'List at least two countries: Vietnam first, then one or more to compare with.';
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
  return errors;
}
