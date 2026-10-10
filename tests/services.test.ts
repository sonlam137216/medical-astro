import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { formatPrice, servicePath } from '../src/lib/services.ts';
import { buildSnapshot, isSnapshot, snapshotProblems } from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

const setup = () => {
  const { raw, sql } = testDb();
  return { raw, db: createDb(sql, { actorId: 'admin-1', audit: true }) };
};

test('the snapshot holds visible services in display order with their inclusions', async () => {
  const { raw, db } = setup();
  const insert = raw.prepare(
    'INSERT INTO services (slug, title, summary, inclusions, price_text, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  insert.run(
    'veneers',
    'Porcelain Veneers',
    'Short text',
    '["Consultation","X-ray"]',
    'From $300',
    2,
    1,
  );
  insert.run('dental-implants', 'Dental Implants', null, '[]', null, 1, 1);
  insert.run('hidden', 'Hidden', null, '[]', null, 0, 0);

  const snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.services?.map((s) => s.slug),
    ['dental-implants', 'veneers'],
  );
  assert.deepEqual(snapshot.services?.[1].inclusions, ['Consultation', 'X-ray']);
  assert.equal(snapshot.services?.[1].priceText, 'From $300');
  assert.equal(snapshot.services?.[0].priceText, null);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), []);
});

test('without a visible service the snapshot has no services section', async () => {
  const { raw, db } = setup();
  raw.prepare("INSERT INTO services (slug, title, is_visible) VALUES ('x', 'X', 0)").run();
  assert.equal((await buildSnapshot(db)).services, undefined);
});

test('inclusions must be a JSON array of at most 12 items; slugs are unique', () => {
  const { raw } = setup();
  assert.match(
    failure(raw, "INSERT INTO services (slug, title, inclusions) VALUES ('a', 'A', '{}')"),
    /CHECK/,
  );
  const many = JSON.stringify(Array.from({ length: 13 }, (_, i) => `item ${i}`));
  assert.match(
    failure(raw, `INSERT INTO services (slug, title, inclusions) VALUES ('b', 'B', '${many}')`),
    /CHECK/,
  );
  raw.prepare("INSERT INTO services (slug, title) VALUES ('c', 'C')").run();
  assert.match(failure(raw, "INSERT INTO services (slug, title) VALUES ('c', 'C2')"), /UNIQUE/);
});

test('only services with a page of their own link to it; the others link into the Services page', () => {
  assert.deepEqual(servicePath('dental-implants'), {
    href: '/services/dental-implants',
    hasPage: true,
  });
  assert.deepEqual(servicePath('veneers'), { href: '/services#veneers', hasPage: false });
});

test('packages: price and service link come through; hidden ones stay out', async () => {
  const { raw, db } = setup();
  raw
    .prepare(
      "INSERT INTO services (id, slug, title) VALUES ('s1', 'dental-implants', 'Dental Implants')",
    )
    .run();
  const insert = raw.prepare(
    'INSERT INTO packages (slug, kind, title, inclusions, price_amount, currency, price_conditions, service_id, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  insert.run(
    'implant-trip',
    'travel_combo',
    'Implant trip',
    '["Hotel","Pickup"]',
    1250.5,
    'USD',
    'Per person',
    's1',
    1,
    1,
  );
  insert.run('quote-only', 'single_treatment', 'On request', '[]', null, null, null, null, 1, 1);
  insert.run('hidden', 'single_treatment', 'Hidden', '[]', null, null, null, null, 0, 0);

  const snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.packages?.map((p) => p.slug),
    ['quote-only', 'implant-trip'],
  );
  const trip = snapshot.packages?.find((p) => p.slug === 'implant-trip');
  assert.deepEqual(trip?.price, { amount: 1250.5, currency: 'USD' });
  assert.equal(trip?.service, 'dental-implants');
  assert.equal(snapshot.packages?.find((p) => p.slug === 'quote-only')?.price, null);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
});

test('a package price needs a currency', () => {
  const { raw } = setup();
  assert.match(
    failure(
      raw,
      "INSERT INTO packages (slug, kind, title, price_amount) VALUES ('a', 'travel_combo', 'A', 5)",
    ),
    /CHECK/,
  );
});

test('destinations: visible ones in display order', async () => {
  const { raw, db } = setup();
  const insert = raw.prepare(
    'INSERT INTO destinations (slug, name, summary, sort_order, is_visible) VALUES (?, ?, ?, ?, ?)',
  );
  insert.run('hoi-an', 'Hoi An', 'Old town', 2, 1);
  insert.run('da-nang', 'Da Nang', 'Beaches', 1, 1);
  insert.run('hidden', 'Hidden', null, 0, 0);
  const snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.destinations?.map((d) => d.slug),
    ['da-nang', 'hoi-an'],
  );
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
});

test('prices are formatted for the cards', () => {
  assert.equal(formatPrice(600, 'USD'), '$600');
  assert.equal(formatPrice(1250.5, 'USD'), '$1,250.50');
});
