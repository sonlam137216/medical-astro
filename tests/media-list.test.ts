import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_PAGE_SIZE, pageMedia, parseIds, searchMedia } from '../src/lib/media-list.ts';

test('search needs every word, ignores case and keeps the order', () => {
  const items = [
    { label: 'Dentist examining a patient' },
    { label: 'Hanoi tower at night' },
    { label: 'Decorative' },
  ];
  assert.deepEqual(searchMedia(items, ''), items);
  assert.deepEqual(searchMedia(items, '   '), items);
  assert.deepEqual(searchMedia(items, 'HANOI night'), [items[1]]);
  assert.deepEqual(searchMedia(items, 'dentist tower'), []);
  assert.deepEqual(searchMedia(items, 'de'), [items[0], items[2]]);
});

test('pages hold 24 items and say whether more follow', () => {
  const items = Array.from({ length: 50 }, (_, i) => i);
  assert.equal(MEDIA_PAGE_SIZE, 24);
  assert.deepEqual(pageMedia(items, 1), { items: items.slice(0, 24), more: true });
  assert.deepEqual(pageMedia(items, 3), { items: [48, 49], more: false });
  assert.deepEqual(pageMedia(items, 4), { items: [], more: false });
  assert.deepEqual(pageMedia(items, 0).items, items.slice(0, 24));
  assert.deepEqual(pageMedia(items, Number.NaN).items, items.slice(0, 24));
  assert.deepEqual(pageMedia(items.slice(0, 24), 1).more, false);
});

test('ids from a query value: only real ids, once each, lower case, capped', () => {
  const a = '3f2b8c1e-7a4d-4b6e-9c10-2d5e8f7a9b01';
  const b = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(parseIds(`${a}, ${b.toUpperCase()},${a}`), [a, b]);
  assert.deepEqual(parseIds("x,1' OR 1=1,,not-an-id"), []);
  assert.deepEqual(parseIds(null), []);
  assert.deepEqual(parseIds(undefined), []);
  const many = Array.from(
    { length: 60 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  );
  assert.equal(parseIds(many.join(',')).length, 40);
  assert.equal(parseIds(many.join(','), 5).length, 5);
});
