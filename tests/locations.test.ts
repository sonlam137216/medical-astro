import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { buildSnapshot, isSnapshot, snapshotProblems } from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

const setup = () => {
  const { raw, sql } = testDb();
  return { raw, db: createDb(sql, { actorId: 'admin-1', audit: true }) };
};

test('the snapshot holds visible clinics in display order, with their photo', async () => {
  const { raw, db } = setup();
  raw
    .prepare(
      `INSERT INTO media_assets (id, r2_key, kind, mime_type, size_bytes, width, height, alt_text, variant_widths)
       VALUES ('11111111-1111-4111-8111-111111111111', 'media/11111111-1111-4111-8111-111111111111/v1/960.webp',
               'image', 'image/webp', 1000, 960, 540, 'Front of the clinic', '[480,960]')`,
    )
    .run();
  const insert = raw.prepare(
    'INSERT INTO locations (slug, name, address_line, directions_url, image_id, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  insert.run('lao-cai', 'Melatec Lao Cai', 'Lot 325', null, null, 2, 1);
  insert.run(
    'ha-noi',
    'Melatec Ha Noi',
    '26 Doan Thi Diem',
    'https://maps.example/ha-noi',
    '11111111-1111-4111-8111-111111111111',
    1,
    1,
  );
  insert.run('closed', 'Closed', 'Nowhere', null, null, 0, 0);

  const snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.locations?.map((l) => l.slug),
    ['ha-noi', 'lao-cai'],
  );
  assert.equal(snapshot.locations?.[0].directionsUrl, 'https://maps.example/ha-noi');
  assert.equal(snapshot.locations?.[0].image?.alt, 'Front of the clinic');
  assert.equal(snapshot.locations?.[1].image, null);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), []);
});

test('without a visible clinic the snapshot has no locations section', async () => {
  const { raw, db } = setup();
  raw.prepare("INSERT INTO locations (slug, name, is_visible) VALUES ('x', 'X', 0)").run();
  assert.equal((await buildSnapshot(db)).locations, undefined);
});

test('the database refuses unsafe directions links and a duplicate slug', () => {
  const { raw } = setup();
  assert.match(
    failure(
      raw,
      "INSERT INTO locations (slug, name, directions_url) VALUES ('a', 'A', 'javascript:alert(1)')",
    ),
    /CHECK/,
  );
  raw.prepare("INSERT INTO locations (slug, name) VALUES ('b', 'B')").run();
  assert.match(failure(raw, "INSERT INTO locations (slug, name) VALUES ('b', 'B2')"), /UNIQUE/);
});
