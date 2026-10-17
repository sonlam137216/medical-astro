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

test('the snapshot holds visible services in display order, each with its visible treatments', async () => {
  const { raw, db } = setup();
  const insert = raw.prepare(
    'INSERT INTO services (slug, title, summary, description, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
  );
  insert.get('veneers', 'Porcelain Veneers', 'Short text', 'One.\n\nTwo.', 2, 1);
  const implants = insert.get('dental-implants', 'Dental Implants', null, null, 1, 1) as {
    id: string;
  };
  const hidden = insert.get('hidden', 'Hidden', null, null, 0, 0) as { id: string };
  const option = raw.prepare(
    'INSERT INTO service_options (service_id, title, subtitle, price_text, inclusions, show_on_home, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  option.run(implants.id, 'All-on-6', null, null, '[]', 0, 3, 1);
  option.run(implants.id, 'All-on-4', 'Full arch', 'From $3,100', '["Temporary denture"]', 1, 2, 1);
  option.run(implants.id, 'Old offer', null, null, '[]', 1, 1, 0);
  option.run(hidden.id, 'Of a hidden service', null, null, '[]', 1, 1, 1);

  const snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.services?.map((s) => s.slug),
    ['dental-implants', 'veneers'],
  );
  assert.deepEqual(snapshot.services?.[0].options, [
    {
      title: 'All-on-4',
      subtitle: 'Full arch',
      priceText: 'From $3,100',
      inclusions: ['Temporary denture'],
      home: true,
    },
    { title: 'All-on-6', subtitle: null, priceText: null, inclusions: [], home: false },
  ]);
  assert.deepEqual(snapshot.services?.[1].options, []);
  assert.equal(snapshot.services?.[1].description, 'One.\n\nTwo.');
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), []);
});

test('a service with treatments cannot be deleted; treatment inclusions are a short JSON array', () => {
  const { raw } = setup();
  const { id } = raw
    .prepare("INSERT INTO services (slug, title) VALUES ('s', 'S') RETURNING id")
    .get() as { id: string };
  const insert = 'INSERT INTO service_options (service_id, title, inclusions) VALUES (?, ?, ?)';
  assert.equal(failure(raw, insert, id, 'A', '[]'), '');
  assert.match(failure(raw, 'DELETE FROM services WHERE id = ?', id), /FOREIGN KEY/);
  assert.match(failure(raw, insert, id, 'B', '{}'), /CHECK/);
  const many = JSON.stringify(Array.from({ length: 13 }, (_, i) => `item ${i}`));
  assert.match(failure(raw, insert, id, 'C', many), /CHECK/);
  assert.match(failure(raw, insert, crypto.randomUUID(), 'D', '[]'), /FOREIGN KEY/);
  raw.prepare('DELETE FROM service_options WHERE service_id = ?').run(id);
  assert.equal(failure(raw, 'DELETE FROM services WHERE id = ?', id), '');
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

test('every service has a page of its own under /services', () => {
  assert.equal(servicePath('dental-implants'), '/services/dental-implants');
  assert.equal(servicePath('veneers'), '/services/veneers');
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

test('a package price unit reaches the snapshot only when set, and is short', async () => {
  const { raw, db } = setup();
  const insert = raw.prepare(
    'INSERT INTO packages (slug, kind, title, price_amount, currency, price_unit) VALUES (?, ?, ?, ?, ?, ?)',
  );
  insert.run('da-lat', 'travel_combo', 'Ha Noi - Da Lat', 199, 'USD', ' per person ');
  insert.run('sa-pa', 'travel_combo', 'Ha Noi - Sa Pa', 119, 'USD', '  ');
  insert.run('implant', 'single_treatment', 'Implant', 400, 'USD', null);
  assert.match(
    failure(
      raw,
      "INSERT INTO packages (slug, kind, title, price_unit) VALUES ('x', 'travel_combo', 'X', ?)",
      'x'.repeat(41),
    ),
    /CHECK/,
  );

  const snapshot = await buildSnapshot(db);
  const bySlug = (slug: string) => snapshot.packages?.find((p) => p.slug === slug);
  assert.equal(bySlug('da-lat')?.priceUnit, 'per person');
  assert.equal('priceUnit' in bySlug('sa-pa')!, false);
  assert.equal('priceUnit' in bySlug('implant')!, false);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  const base = { slug: 'a', kind: 'travel_combo', title: 'A', inclusions: [], price: null };
  assert.equal(isSnapshot({ packages: [{ ...base, priceUnit: 3 }] }), false);
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

test('a service keeps its card photo and its banner picture apart; the banner needs a description', async () => {
  const { raw, db } = setup();
  const media = raw.prepare(
    `INSERT INTO media_assets (id, r2_key, kind, mime_type, size_bytes, width, height, alt_text, variant_widths)
     VALUES (?, ?, 'image', 'image/webp', 1000, ?, ?, ?, '[480,960,1600]')`,
  );
  const card = '11111111-1111-4111-8111-111111111111';
  const wide = '22222222-2222-4222-8222-222222222222';
  media.run(card, `media/${card}/v1/960.webp`, 960, 480, 'A crown on a model');
  media.run(wide, `media/${wide}/v1/1600.webp`, 1600, 444, null);
  raw
    .prepare(
      "INSERT INTO services (slug, title, image_id, banner_image_id) VALUES ('crowns', 'Crowns', ?, ?)",
    )
    .run(card, wide);
  raw.prepare("INSERT INTO services (slug, title) VALUES ('plain', 'Plain')").run();

  const snapshot = await buildSnapshot(db);
  const [crowns, plain] = snapshot.services ?? [];
  assert.equal(crowns.image?.key, `media/${card}/v1/960.webp`);
  assert.equal(crowns.banner?.key, `media/${wide}/v1/1600.webp`);
  assert.equal('banner' in plain, false); // only when chosen
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), [
    'Service “Crowns”: the banner picture has no description. Add one in Media, or mark the image as decorative.',
  ]);
  // A picture in use as a banner cannot be deleted.
  assert.match(failure(raw, 'DELETE FROM media_assets WHERE id = ?', wide), /FOREIGN KEY/);
});

test('two links to the same table need the column named', async () => {
  const { db } = setup();
  const { error } = await db.from('services').select('slug, image:media_assets(r2_key)');
  assert.ok(error);
});
