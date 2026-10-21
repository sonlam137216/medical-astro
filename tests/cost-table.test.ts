import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_COUNTRIES,
  costTableErrors,
  priceFor,
  splitCell,
  suggestedSaving,
  upgradeCostTable,
} from '../src/lib/cms/cost-table.ts';
import { mergeSection, sectionByKey, upgradeSectionData } from '../src/lib/cms/sections.ts';
import {
  formFromData,
  itemInput,
  parseFields,
  priceInput,
  valuesFromForm,
  valuesFromRow,
  type CountryPrice,
} from '../src/lib/cms/fields.ts';
import { snapshotProblems } from '../src/lib/snapshot.ts';

const price = (country: string, p: string, detail = '', saving = ''): CountryPrice => ({
  country,
  price: p,
  detail,
  saving,
});

const table = (over: Record<string, unknown> = {}) => ({
  label: 'Treatment costs',
  title: 'Costs',
  countries: ['Vietnam', 'Australia', 'Germany'],
  compare: '',
  rows: [
    {
      name: 'Implant',
      note: '',
      prices: [price('Vietnam', '€900'), price('Germany', '€2,400', '12 clinics', '62%')],
    },
  ],
  methodology: '',
  ...over,
});

test('an old price line names its country', () => {
  assert.deepEqual(splitCell('Australia: A$1,250 | 40 clinics'), {
    country: 'Australia',
    value: 'A$1,250 | 40 clinics',
  });
  assert.deepEqual(splitCell('United Kingdom:£900'), { country: 'United Kingdom', value: '£900' });
  assert.equal(splitCell('A$1,250 | 40 clinics'), null);
  assert.equal(splitCell(': $1'), null);
  assert.equal(splitCell('A$1 | open 8:00'), null); // "|" before the colon: no country
  const prices = [price('vietnam', '$900'), price('Germany', '')];
  assert.equal(priceFor(prices, 'Vietnam')?.price, '$900'); // spelling case does not matter
  assert.equal(priceFor(prices, 'Germany'), undefined); // no price, no cell
  assert.equal(priceFor(prices, 'Australia'), undefined);
});

test('the saving is offered from two prices in the same currency', () => {
  assert.equal(suggestedSaving('US$1,100', 'US$4,200'), '73%'); // 73.8, rounded down
  assert.equal(suggestedSaving('US$1,100', 'us$ 4,500'), '75%');
  assert.equal(suggestedSaving('1.100 €', '4.000 €'), '72%');
  assert.equal(suggestedSaving('$150.50', '$1,500'), '89%');
  assert.equal(suggestedSaving('US$1,100', 'A$4,200'), ''); // two currencies
  assert.equal(suggestedSaving('US$1,100', 'from US$4,200'), '');
  assert.equal(suggestedSaving('US$1,100', 'US$1,000–1,500'), '');
  assert.equal(suggestedSaving('US$4,200', 'US$1,100'), ''); // not cheaper
  assert.equal(suggestedSaving('', 'US$1,100'), '');
});

test('a table saved with the fixed columns keeps every price under its country', () => {
  const saved = {
    rows: [
      { name: 'Implant', cells: ['$900', 'US$4,000', 'A$1,250 | 40 clinics'], saving: 'Up to 70%' },
      { name: 'Crown', cells: [] },
      'odd',
    ],
  };
  const up = upgradeCostTable(saved);
  assert.deepEqual(up.countries, LEGACY_COUNTRIES);
  assert.equal(up.compare, 'Australia');
  const rows = up.rows as Record<string, unknown>[];
  assert.deepEqual(rows[0], {
    name: 'Implant',
    prices: [
      price('Vietnam', '$900'),
      price('United States', 'US$4,000', '', 'Up to 70%'),
      price('Australia', 'A$1,250', '40 clinics', 'Up to 70%'),
    ],
  });
  assert.deepEqual(rows[1], { name: 'Crown', prices: [] });
  assert.equal(rows[2], 'odd');
  assert.deepEqual(costTableErrors(up), {});
  // saved since: left alone
  const current = table();
  assert.equal(upgradeCostTable(current), current);
  // the cost table sections run it wherever a row is read; other sections do not get countries
  const fields = sectionByKey('home_costs')!.fields;
  assert.deepEqual(upgradeSectionData(fields, saved).countries, LEGACY_COUNTRIES);
  assert.equal('countries' in upgradeSectionData(sectionByKey('home_why')!.fields, {}), false);
  const sample = { label: '', title: '', countries: ['Vietnam', 'Japan'], compare: '', rows: [] };
  const merged = mergeSection(sample, { rows: [] }, fields);
  assert.deepEqual(merged.countries, LEGACY_COUNTRIES);
});

test('a table saved with one price line per country gets the price boxes', () => {
  const saved = {
    label: 'Treatment costs',
    title: 'Costs',
    countries: ['Vietnam', 'Germany', 'Japan'],
    compare: 'Japan',
    rows: [
      {
        name: 'Implant',
        note: 'Per tooth',
        cells: ['Vietnam: €900 | Melatec', 'Germany: €2,400 | 12 clinics | 2026', 'Mars: €1'],
        saving: '60%',
      },
    ],
  };
  const up = upgradeCostTable(saved);
  assert.equal(up.compare, 'Japan');
  assert.equal('cells' in (up.rows as Record<string, unknown>[])[0], false);
  assert.deepEqual((up.rows as Record<string, unknown>[])[0], {
    name: 'Implant',
    note: 'Per tooth',
    prices: [
      price('Vietnam', '€900', 'Melatec'),
      price('Germany', '€2,400', '12 clinics | 2026', '60%'),
      price('Mars', '€1', '', '60%'),
    ],
  });
  // Publish keeps only the countries of the list (Mars is left out, not an error)
  const def = sectionByKey('home_costs')!;
  const parsed = parseFields(def.fields, formFromData(def.fields, up));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual((parsed.value.rows as { prices: CountryPrice[] }[])[0].prices, [
    price('Vietnam', '€900', 'Melatec'),
    price('Germany', '€2,400', '12 clinics | 2026', '60%'),
  ]);
});

test('the countries and the compared country must agree', () => {
  assert.deepEqual(costTableErrors(table()), {});
  assert.deepEqual(costTableErrors(table({ compare: 'germany' })), {});
  assert.match(costTableErrors(table({ countries: ['Vietnam'] })).countries!, /at least two/);
  assert.match(
    costTableErrors(table({ countries: ['Vietnam', 'Australia', 'australia '] })).countries!,
    /listed twice/,
  );
  assert.match(costTableErrors(table({ compare: 'Vietnam' })).compare!, /first column/);
  assert.match(costTableErrors(table({ compare: 'France' })).compare!, /not in the Countries/);
});

test('the price boxes of the form are read per country', () => {
  const def = sectionByKey('home_costs')!;
  assert.equal(def.check, costTableErrors);
  assert.equal(sectionByKey('implants_comparison')!.check, costTableErrors);

  // The countries come as one box each; the rows of a treatment carry their country's name.
  const form = new URLSearchParams({
    label: 'Treatment costs',
    title: 'Costs',
    compare: 'Germany',
  });
  for (const c of ['Vietnam', '', 'Germany', 'Australia']) form.append('countries', c);
  form.set(itemInput('rows', 0, 'name'), 'Implant');
  const box = (j: number, part: 'country' | 'price' | 'detail' | 'saving', v: string) =>
    form.set(priceInput('rows', 0, 'prices', j, part), v);
  // typed in another order than the list; France was removed from the list; Vietnam's saving is ignored
  box(0, 'country', 'Australia');
  box(0, 'price', ' €2,000 ');
  box(1, 'country', 'Vietnam');
  box(1, 'price', '€900');
  box(1, 'saving', '10%');
  box(2, 'country', 'France');
  box(2, 'price', '€1,900');
  box(3, 'country', 'Germany');
  form.set(itemInput('rows', 1, 'name'), '');
  form.set(priceInput('rows', 1, 'prices', 0, 'country'), 'Vietnam'); // an empty card: left out
  const parsed = parseFields(def.fields, form);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value.countries, ['Vietnam', 'Germany', 'Australia']);
  assert.deepEqual(parsed.value.rows, [
    {
      name: 'Implant',
      note: '',
      prices: [price('Vietnam', '€900'), price('Australia', '€2,000')],
    },
  ]);
  assert.deepEqual(def.check!(parsed.value), {});

  // the form shown again after an error keeps what was typed
  const values = valuesFromForm(def.fields, form);
  assert.equal(values.countries, 'Vietnam\nGermany\nAustralia');
  assert.match(String(values[itemInput('rows', 0, 'prices')]), /"France"/);
  // and the saved row comes back into the same boxes
  const again = valuesFromRow(def.fields, parsed.value);
  assert.deepEqual(JSON.parse(String(again[itemInput('rows', 0, 'prices')])), [
    price('Vietnam', '€900'),
    price('Australia', '€2,000'),
  ]);
  assert.equal(again[itemInput('rows', 1, 'prices')], '');

  // a saving or a line without a price is a mistake
  box(3, 'saving', '50%');
  const missing = parseFields(def.fields, form);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.errors.rows, /Treatment 1, Germany: add the price/);
  box(3, 'saving', '');
  box(3, 'price', 'x'.repeat(41));
  const long = parseFields(def.fields, form);
  assert.equal(long.ok, false);
  if (!long.ok) assert.match(long.errors.rows, /keep the price under 40/);
});

test('Publish applies the same rules as the form', () => {
  const problems = snapshotProblems({
    sections: [
      { key: 'home_costs', visible: true, data: table({ compare: 'Japan' }) },
      { key: 'implants_comparison', visible: true, data: table() },
    ],
  });
  assert.deepEqual(problems, [
    'Page text “Home: treatment costs table”: “Japan” is not in the Countries list.',
  ]);
  const noPrice = table({
    rows: [{ name: 'Implant', note: '', prices: [price('Germany', '', '', '50%')] }],
  });
  assert.match(
    snapshotProblems({ sections: [{ key: 'home_costs', visible: true, data: noPrice }] })[0],
    /Germany: add the price/,
  );
});
