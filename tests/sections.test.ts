import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PAGES } from '../src/lib/cms/pages.ts';
import {
  ICON_CHOICES,
  REQUIRED_SECTIONS,
  SECTIONS,
  mergeSection,
  sectionByKey,
  upgradeSectionData,
} from '../src/lib/cms/sections.ts';
import { itemInput, parseFields, valuesFromRow, type Field } from '../src/lib/cms/fields.ts';
import { createDb } from '../src/lib/db.ts';
import {
  buildSnapshot,
  isSnapshot,
  sampleSections,
  snapshotProblems,
} from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

test('the section list is consistent', () => {
  const keys = SECTIONS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length, 'keys are unique');
  for (const s of SECTIONS) {
    assert.match(s.key, /^[a-z][a-z0-9_]*$/, s.key); // the database check on page_sections.type
    assert.ok(s.key.length <= 60);
    assert.ok(
      BUILTIN_PAGES.some((p) => p.path === s.page),
      `${s.key}: page ${s.page} exists`,
    );
    const names = s.fields.map((f) => f.name);
    assert.equal(new Set(names).size, names.length, `${s.key}: field names are unique`);
    assert.ok(s.fields.length > 0);
  }
  for (const key of REQUIRED_SECTIONS) assert.ok(sectionByKey(key), key);
});

test('a section row replaces the words and keeps what the admin cannot edit', () => {
  const sample = {
    title: 'Old title',
    paragraphs: ['a', 'b'],
    steps: [
      { number: '01', title: 'One', body: 'x', image: 'IMG1' },
      { number: '02', title: 'Two', body: 'y', image: 'IMG2' },
    ],
    fixed: 'stays',
  };
  const merged = mergeSection(sample, {
    title: 'New title',
    paragraphs: ['only one'],
    steps: [
      { title: 'First', body: 'p' },
      { title: 'Second', body: 'q' },
      { title: 'Third', body: 'r' },
    ],
  });
  assert.equal(merged.title, 'New title');
  assert.deepEqual(merged.paragraphs, ['only one']);
  assert.equal(merged.fixed, 'stays');
  assert.deepEqual(
    merged.steps.map((s) => [s.number, s.title, s.image]),
    [
      ['01', 'First', 'IMG1'],
      ['02', 'Second', 'IMG2'],
      ['03', 'Third', 'IMG2'], // a card beyond the built-in ones borrows the last built-in picture
    ],
  );
});

test('a field added after a row was saved counts as empty, not as the built-in words', () => {
  const steps = mergeSection(
    { steps: [{ number: '01', title: 'Built-in', body: 'b', tag: 'Online' }] },
    { steps: [{ title: 'Mine', body: 'mine' }] }, // saved before the "tag" and "icon" columns existed
    sectionByKey('home_how')!.fields,
  );
  assert.deepEqual(steps.steps[0], {
    number: '01',
    title: 'Mine',
    body: 'mine',
    tag: '',
    icon: '',
  });

  // Without the fields (older callers) the built-in words still fill the gap.
  const loose = mergeSection({ label: 'Built-in', title: 'T' }, { title: 'Mine' });
  assert.equal(loose.label, 'Built-in');
});

test('an emptied list stays empty instead of falling back to the built-in cards', () => {
  const merged = mergeSection({ items: [{ title: 'a' }] }, { items: [] });
  assert.deepEqual(merged.items, []);
});

test('items fields: parsed per slot, empty slots are left out, form state round-trips', () => {
  const field: Field = {
    type: 'items',
    name: 'steps',
    label: 'Steps',
    itemLabel: 'Step',
    maxItems: 4,
    columns: [
      { name: 'title', label: 'Title', kind: 'text', max: 10, required: true },
      { name: 'lines', label: 'Lines', kind: 'lines', max: 20 },
    ],
  };
  const form = new URLSearchParams({
    [itemInput('steps', 0, 'title')]: ' First ',
    [itemInput('steps', 0, 'lines')]: 'a\n\n b \n',
    [itemInput('steps', 2, 'title')]: 'Third', // slot 1 is empty: skipped
  });
  const parsed = parseFields([field], form);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.value.steps, [
    { title: 'First', lines: ['a', 'b'] },
    { title: 'Third', lines: [] },
  ]);

  const values = valuesFromRow([field], { steps: parsed.value.steps });
  assert.equal(values[itemInput('steps', 0, 'lines')], 'a\nb');
  assert.equal(values[itemInput('steps', 1, 'title')], 'Third');

  // a card with text but without its required title is an error; too long text is an error
  const bad = parseFields([field], new URLSearchParams({ [itemInput('steps', 0, 'lines')]: 'x' }));
  assert.ok(!bad.ok && bad.errors.steps);
  const tooLong = parseFields(
    [field],
    new URLSearchParams({ [itemInput('steps', 0, 'title')]: 'x'.repeat(11) }),
  );
  assert.ok(!tooLong.ok);
  // nothing filled in and not required: an empty list
  const none = parseFields([field], new URLSearchParams());
  assert.ok(none.ok && (none.value.steps as unknown[]).length === 0);
});

test('items fields: a choice column takes a listed value or none, and alone makes no card', () => {
  const field: Field = {
    type: 'items',
    name: 'steps',
    label: 'Steps',
    itemLabel: 'Step',
    maxItems: 3,
    columns: [
      { name: 'title', label: 'Title', kind: 'text', max: 20, required: true },
      {
        name: 'icon',
        label: 'Icon',
        kind: 'choice',
        max: 40,
        options: [{ value: 'camera', label: 'Camera' }],
      },
    ],
  };
  const parsed = parseFields(
    [field],
    new URLSearchParams({
      [itemInput('steps', 0, 'title')]: 'Photo',
      [itemInput('steps', 0, 'icon')]: 'camera',
      [itemInput('steps', 1, 'title')]: 'No icon',
      [itemInput('steps', 2, 'icon')]: 'camera', // no title: dropped, not an error
    }),
  );
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.value.steps, [
    { title: 'Photo', icon: 'camera' },
    { title: 'No icon', icon: '' },
  ]);
  const values = valuesFromRow([field], { steps: parsed.value.steps });
  assert.equal(values[itemInput('steps', 0, 'icon')], 'camera');

  const unknown = parseFields(
    [field],
    new URLSearchParams({
      [itemInput('steps', 0, 'title')]: 'Photo',
      [itemInput('steps', 0, 'icon')]: 'rocket',
    }),
  );
  assert.ok(!unknown.ok && unknown.errors.steps);
});

test('How it works: each step has an icon list, and a row saved before it was added has no icon', () => {
  const how = sectionByKey('home_how')!;
  const steps = how.fields.find((f) => f.name === 'steps');
  assert.ok(steps && steps.type === 'items');
  const icon = steps.columns.find((c) => c.name === 'icon');
  assert.ok(icon?.kind === 'choice' && (icon.options?.length ?? 0) > 0);

  // Not the built-in camera icon next to the admin's own words: the saved row counts as "None".
  const sample = { steps: [{ title: 'Send Us a Photo', body: '', tag: '', icon: 'camera' }] };
  const merged = mergeSection(
    sample,
    { steps: [{ title: 'Mine', body: '', tag: '' }] },
    how.fields,
  );
  assert.equal(merged.steps[0].icon, '');
});

// (That every choice is a known icon is checked by `npm run check`, in src/lib/icons.ts.)
test('cards and banner badges have an icon column with the shared choices', () => {
  for (const [key, field] of [
    ['about_why', 'items'],
    ['shared_tourism', 'items'],
    ['doctors_hero', 'chips'],
    ['implants_hero', 'chips'],
  ]) {
    const f = sectionByKey(key)!.fields.find((x) => x.name === field);
    assert.ok(f && f.type === 'items', key);
    const icon = f.columns.find((c) => c.name === 'icon');
    assert.ok(icon?.kind === 'choice', key);
    assert.deepEqual(icon.options, ICON_CHOICES, key);
  }
});

test('banner badges saved as plain lines are read as badges without an icon', () => {
  const doctors = sectionByKey('doctors_hero')!;
  const saved = { label: 'L', title: 'T', body: '', chips: ['15+ years', 'English'] };
  const upgraded = upgradeSectionData(doctors.fields, saved);
  assert.deepEqual(upgraded.chips, [{ text: '15+ years' }, { text: 'English' }]);
  assert.deepEqual(saved.chips, ['15+ years', 'English'], 'the saved row is not changed');

  // the admin form shows them in the text column
  const values = valuesFromRow(doctors.fields, upgraded);
  assert.equal(values[itemInput('chips', 1, 'text')], 'English');
  assert.equal(values[itemInput('chips', 1, 'icon')], '');

  // a page built from an older revision: the words, and no built-in icon next to them
  const sample = { chips: [{ text: 'Built-in', icon: 'stethoscope' }] };
  const merged = mergeSection(sample, saved, doctors.fields);
  assert.deepEqual(merged.chips, [
    { text: '15+ years', icon: '' },
    { text: 'English', icon: '' },
  ]);

  // and such a row still passes the publish checks
  assert.deepEqual(
    snapshotProblems({ sections: [{ key: 'doctors_hero', visible: true, data: upgraded }] }),
    [],
  );
});

const setup = () => {
  const { raw, sql } = testDb();
  return { raw, db: createDb(sql, { actorId: 'admin-1', audit: true }) };
};

test('the snapshot holds the page text rows, with hidden ones and photos resolved', async () => {
  const { raw, db } = setup();
  raw.prepare("INSERT INTO pages (id, path, title) VALUES ('p1', '/', 'Home')").run();
  raw
    .prepare(
      `INSERT INTO media_assets (id, r2_key, kind, mime_type, size_bytes, width, height, alt_text, variant_widths)
       VALUES ('11111111-1111-4111-8111-111111111111', 'media/11111111-1111-4111-8111-111111111111/v1/960.webp',
               'image', 'image/webp', 1000, 960, 540, 'A smile', '[960]')`,
    )
    .run();
  const insert = raw.prepare(
    'INSERT INTO page_sections (page_id, type, is_visible, data) VALUES (?, ?, ?, ?)',
  );
  insert.run(
    'p1',
    'home_smile',
    1,
    JSON.stringify({
      label: 'L',
      title: 'T',
      summary: 'S',
      detailsTitle: 'D',
      details: ['x'],
      before: '11111111-1111-4111-8111-111111111111',
    }),
  );
  insert.run('p1', 'home_costs', 0, '{}');
  insert.run('p1', 'no_such_section', 1, '{}');

  const snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.sections?.map((s) => [s.key, s.visible]),
    [
      ['home_costs', false],
      ['home_smile', true],
    ],
  );
  const smile = snapshot.sections?.find((s) => s.key === 'home_smile');
  assert.equal(smile?.images?.before.alt, 'A smile');
  assert.equal('before' in (smile?.data ?? {}), false);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), []);
  // a hidden required section counts as decided; the others are still missing for production
  const missing = sampleSections(snapshot);
  assert.ok(!missing.some((m) => m.includes('Home: treatment costs table')));
  assert.ok(missing.some((m) => m.includes('About: figures')));
});

test('text that breaks the form rules is reported before publishing', () => {
  const problems = snapshotProblems({
    sections: [
      { key: 'about_stats', visible: true, data: { items: [{ value: '', label: 'No value' }] } },
      { key: 'home_why', visible: true, data: { label: 'L', title: 'T'.repeat(300), items: [] } },
      // not shown on the website, so its content is not checked
      { key: 'home_costs', visible: false, data: { rows: 'broken' } },
    ],
  });
  assert.ok(problems.some((p) => p.includes('About: figures')));
  assert.ok(problems.some((p) => p.includes('Home: why Melatec')));
  assert.ok(!problems.some((p) => p.includes('treatment costs')));
});

test('a page has one row per section type', () => {
  const { raw } = setup();
  raw.prepare("INSERT INTO pages (id, path, title) VALUES ('p1', '/', 'Home')").run();
  raw.prepare("INSERT INTO page_sections (page_id, type) VALUES ('p1', 'home_hero')").run();
  assert.match(
    failure(raw, "INSERT INTO page_sections (page_id, type) VALUES ('p1', 'home_hero')"),
    /UNIQUE/,
  );
});
