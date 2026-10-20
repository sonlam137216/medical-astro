import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_COUNTRIES,
  cellFor,
  costTableErrors,
  splitCell,
  upgradeCostTable,
} from '../src/lib/cms/cost-table.ts';
import { mergeSection, sectionByKey, upgradeSectionData } from '../src/lib/cms/sections.ts';
import { itemInput, parseFields } from '../src/lib/cms/fields.ts';
import { snapshotProblems } from '../src/lib/snapshot.ts';

const table = (over: Record<string, unknown> = {}) => ({
  label: 'Treatment costs',
  title: 'Costs',
  countries: ['Vietnam', 'Australia', 'Germany'],
  compare: '',
  rows: [{ name: 'Implant', note: '', cells: ['Vietnam: $900', 'Germany: €2,400 | 12 clinics'] }],
  methodology: '',
  ...over,
});

test('a price line names its country', () => {
  assert.deepEqual(splitCell('Australia: A$1,250 | 40 clinics'), {
    country: 'Australia',
    value: 'A$1,250 | 40 clinics',
  });
  assert.deepEqual(splitCell('United Kingdom:£900'), { country: 'United Kingdom', value: '£900' });
  assert.equal(splitCell('A$1,250 | 40 clinics'), null);
  assert.equal(splitCell(': $1'), null);
  assert.equal(splitCell('A$1 | open 8:00'), null); // "|" before the colon: no country
  const lines = ['vietnam: $900', 'Germany: €2,400'];
  assert.equal(cellFor(lines, 'Vietnam'), '$900'); // spelling case does not matter
  assert.equal(cellFor(lines, 'Australia'), '');
});

test('a table saved with the fixed columns keeps every price under its country', () => {
  const saved = {
    rows: [
      { name: 'Implant', cells: ['$900', 'US$4,000', 'A$1,250 | 40 clinics'] },
      { name: 'Crown', cells: [] },
      'odd',
    ],
  };
  const up = upgradeCostTable(saved);
  assert.deepEqual(up.countries, LEGACY_COUNTRIES);
  assert.equal(up.compare, 'Australia');
  assert.deepEqual((up.rows as { cells: string[] }[])[0].cells, [
    'Vietnam: $900',
    'United States: US$4,000',
    'Australia: A$1,250 | 40 clinics',
  ]);
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

test('countries and prices must agree', () => {
  assert.deepEqual(costTableErrors(table()), {});
  assert.deepEqual(costTableErrors(table({ compare: 'germany' })), {});
  assert.match(costTableErrors(table({ countries: ['Vietnam'] })).countries!, /at least two/);
  assert.match(
    costTableErrors(table({ countries: ['Vietnam', 'Australia', 'australia '] })).countries!,
    /listed twice/,
  );
  assert.match(costTableErrors(table({ countries: ['Vietnam', 'A: B'] })).countries!, /“:”/);
  assert.match(costTableErrors(table({ compare: 'Vietnam' })).compare!, /first column/);
  assert.match(costTableErrors(table({ compare: 'France' })).compare!, /not in the Countries/);
  const row = (cells: string[]) => table({ rows: [{ name: 'Implant', cells }] });
  assert.match(
    costTableErrors(row(['$900'])).rows!,
    /Treatment 1 \(“Implant”\): start each price with its country/,
  );
  assert.match(costTableErrors(row(['Germny: €2,400'])).rows!, /“Germny” is not in the Countries/);
  assert.match(costTableErrors(row(['Vietnam: $1', 'vietnam: $2'])).rows!, /two prices/);
});

test('the admin form and Publish both apply the table rules', () => {
  const def = sectionByKey('home_costs')!;
  assert.equal(def.check, costTableErrors);
  assert.equal(sectionByKey('implants_comparison')!.check, costTableErrors);

  const form = new URLSearchParams({
    label: 'Treatment costs',
    title: 'Costs',
    countries: 'Vietnam\nAustralia\n\nGermany',
    compare: 'Germany',
  });
  form.set(itemInput('rows', 0, 'name'), 'Implant');
  form.set(itemInput('rows', 0, 'cells'), 'Vietnam: $900\nFrance: €2,000');
  const parsed = parseFields(def.fields, form);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value.countries, ['Vietnam', 'Australia', 'Germany']);
  assert.match(def.check!(parsed.value).rows!, /“France” is not in the Countries list/);

  const problems = snapshotProblems({
    sections: [
      { key: 'home_costs', visible: true, data: table({ compare: 'Japan' }) },
      { key: 'implants_comparison', visible: true, data: table() },
    ],
  });
  assert.deepEqual(problems, [
    'Page text “Home: treatment costs table”: “Japan” is not in the Countries list.',
  ]);
});
