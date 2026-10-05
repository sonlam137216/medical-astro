import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyValues,
  parseFields,
  slugify,
  valuesFromForm,
  valuesFromRow,
  type Field,
} from '../src/lib/cms/fields.ts';

const fields: Field[] = [
  { type: 'text', name: 'title', label: 'Title', max: 20, required: true },
  { type: 'slug', name: 'slug', label: 'Address', from: 'title' },
  { type: 'url', name: 'href', label: 'Link', max: 50 },
  { type: 'textarea', name: 'body', label: 'Body', max: 30 },
  { type: 'lines', name: 'items', label: 'Items', maxItems: 3, maxLength: 10 },
  { type: 'path', name: 'from_path', label: 'From' },
  { type: 'email', name: 'mail', label: 'Mail', max: 50 },
  { type: 'weburl', name: 'web', label: 'Web', max: 60 },
  { type: 'text', name: 'locked', label: 'Locked', max: 5, readonly: true },
  { type: 'int', name: 'sort_order', label: 'Order', min: 0, max: 100, default: 0 },
  { type: 'bool', name: 'is_visible', label: 'Visible', default: true },
  {
    type: 'select',
    name: 'kind',
    label: 'Kind',
    options: [
      ['a', 'A'],
      ['b', 'B'],
    ],
    default: 'a',
  },
  { type: 'image', name: 'image_id', label: 'Image' },
  { type: 'ref', name: 'service_id', label: 'Service', table: 'services', labelColumn: 'title' },
  { type: 'date', name: 'published_on', label: 'Date' },
  { type: 'money', name: 'price_amount', label: 'Price', currencyName: 'currency' },
];
const form = (o: Record<string, string>) => new URLSearchParams(o);
const ok = (o: Record<string, string>) => {
  const r = parseFields(fields, form(o));
  assert.equal(r.ok, true, JSON.stringify(r));
  return (r as { ok: true; value: Record<string, unknown> }).value;
};
const errs = (o: Record<string, string>) => {
  const r = parseFields(fields, form(o));
  assert.equal(r.ok, false);
  return (r as { ok: false; errors: Record<string, string> }).errors;
};

test('slugify handles Vietnamese and symbols', () => {
  assert.equal(slugify('Dr. Lê Thị Yến Đặng'), 'dr-le-thi-yen-dang');
  assert.equal(slugify('  --Hello,   World!!  '), 'hello-world');
  assert.equal(slugify('???'), '');
});

test('valid input is normalised', () => {
  const v = ok({
    title: '  Dental   Implants ',
    items: 'A\n\n  B  \r\nC',
    is_visible: 'on',
    kind: 'b',
  });
  assert.equal(v.title, 'Dental Implants');
  assert.equal(v.slug, 'dental-implants'); // derived from the title
  assert.deepEqual(v.items, ['A', 'B', 'C']);
  assert.equal(v.is_visible, true);
  assert.equal(v.sort_order, 0); // empty -> default
  assert.equal(v.body, null);
  assert.equal(v.image_id, null);
  assert.equal(v.price_amount, null);
  assert.equal(v.currency, null);
});

test('checkbox absent means false', () => {
  assert.equal(ok({ title: 'X' }).is_visible, false);
});

test('required text', () => {
  assert.ok(errs({ title: '   ' }).title);
});

test('length limits', () => {
  assert.ok(errs({ title: 'x'.repeat(21) }).title);
  assert.ok(errs({ title: 'X', body: 'y'.repeat(31) }).body);
  assert.ok(errs({ title: 'X', items: 'a\nb\nc\nd' }).items);
  assert.ok(errs({ title: 'X', items: 'x'.repeat(11) }).items);
});

test('links accept safe schemes only', () => {
  for (const good of [
    '/about',
    '#consultation',
    'https://example.com/a',
    'http://example.com',
    'mailto:a@b.co',
    'tel:+84123',
  ]) {
    assert.equal(ok({ title: 'X', href: good }).href, good, good);
  }
  for (const bad of [
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://x',
    'example.com',
    'JAVASCRIPT:alert(1)',
    ' vbscript:x',
  ]) {
    assert.ok(errs({ title: 'X', href: bad }).href, bad);
  }
});

test('slug rules', () => {
  assert.equal(ok({ title: 'X', slug: 'My-Slug' }).slug, 'my-slug');
  assert.ok(errs({ title: 'X', slug: 'bad slug!' }).slug);
  assert.ok(errs({ title: '???' }).slug); // nothing to derive a slug from
});

test('integers', () => {
  assert.equal(ok({ title: 'X', sort_order: '7' }).sort_order, 7);
  for (const bad of ['-1', '101', '1.5', 'abc'])
    assert.ok(errs({ title: 'X', sort_order: bad }).sort_order, bad);
});

test('select must be a known option', () => {
  assert.equal(ok({ title: 'X' }).kind, 'a'); // default
  assert.ok(errs({ title: 'X', kind: 'z' }).kind);
});

test('image / ref ids must be uuids', () => {
  const id = '3F2504E0-4F89-41D3-9A0C-0305E82C3301';
  assert.equal(ok({ title: 'X', image_id: id }).image_id, id.toLowerCase());
  assert.ok(errs({ title: 'X', image_id: 'not-a-uuid' }).image_id);
  assert.ok(errs({ title: 'X', service_id: '1; drop table' }).service_id);
});

test('dates must be real', () => {
  assert.equal(ok({ title: 'X', published_on: '2026-02-28' }).published_on, '2026-02-28');
  for (const bad of ['2026-02-30', '2026-13-01', '05/10/2026', 'yesterday'])
    assert.ok(errs({ title: 'X', published_on: bad }).published_on, bad);
});

test('money needs an amount format and a currency', () => {
  const v = ok({ title: 'X', price_amount: '1,250.5', currency: 'usd' });
  assert.equal(v.price_amount, 1250.5);
  assert.equal(v.currency, 'USD');
  assert.ok(errs({ title: 'X', price_amount: '600' }).price_amount); // no currency
  assert.ok(errs({ title: 'X', price_amount: '-5', currency: 'USD' }).price_amount);
  assert.ok(errs({ title: 'X', price_amount: '12.345', currency: 'USD' }).price_amount);
  assert.ok(errs({ title: 'X', price_amount: 'abc', currency: 'USD' }).price_amount);
});

test('form state round trips', () => {
  const empty = emptyValues(fields);
  assert.equal(empty.is_visible, true);
  assert.equal(empty.sort_order, '0');
  assert.equal(empty.currency, 'USD');
  const row = {
    title: 'T',
    items: ['a', 'b'],
    is_visible: false,
    sort_order: 4,
    price_amount: 600,
    currency: 'EUR',
    image_id: null,
  };
  const shown = valuesFromRow(fields, row);
  assert.equal(shown.items, 'a\nb');
  assert.equal(shown.is_visible, false);
  assert.equal(shown.price_amount, '600');
  assert.equal(shown.currency, 'EUR');
  assert.equal(shown.image_id, '');
  const typed = valuesFromForm(fields, form({ title: 'typed', is_visible: 'on', items: 'x\ny' }));
  assert.equal(typed.title, 'typed');
  assert.equal(typed.is_visible, true);
});

test('page paths', () => {
  for (const good of ['/', '/about', '/services/dental-implants', '/Old-Page']) {
    assert.equal(ok({ title: 'X', from_path: good }).from_path, good.toLowerCase(), good);
  }
  for (const bad of ['about', '/About page', '//x', '/a//b', '/a/', '/x?y=1', 'https://x.com/a']) {
    assert.ok(errs({ title: 'X', from_path: bad }).from_path, bad);
  }
});

test('a slug without a source field must be typed', () => {
  const only: Field[] = [{ type: 'slug', name: 'group_key', label: 'Group' }];
  assert.equal(parseFields(only, form({ group_key: 'Dental-Implants' })).ok, true);
  assert.equal(parseFields(only, form({})).ok, false);
});

test('emails', () => {
  assert.equal(ok({ title: 'X', mail: 'a@b.co' }).mail, 'a@b.co');
  for (const bad of ['a@b', 'a b@c.co', '@b.co', 'plain'])
    assert.ok(errs({ title: 'X', mail: bad }).mail, bad);
});

test('web addresses are http(s) only', () => {
  assert.equal(
    ok({ title: 'X', web: 'https://facebook.com/melatec' }).web,
    'https://facebook.com/melatec',
  );
  for (const bad of [
    'mailto:a@b.co',
    '/about',
    'javascript:alert(1)',
    'https://a b.com',
    'ftp://x.com',
  ])
    assert.ok(errs({ title: 'X', web: bad }).web, bad);
});

test('read-only fields are ignored by the parser', () => {
  const v = ok({ title: 'X', locked: 'something much too long' });
  assert.equal('locked' in v, false);
});
