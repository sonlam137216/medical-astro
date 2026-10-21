import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { smileResultErrors } from '../src/lib/cms/smile-results.ts';
import { buildSnapshot, isSnapshot, snapshotProblems } from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

const setup = () => {
  const { raw, sql } = testDb();
  raw.exec(
    "INSERT INTO services (id, slug, title) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dental-implants', 'Dental Implants')",
  );
  return { raw, db: createDb(sql, { actorId: 'admin-1', audit: true }) };
};

const ids = {
  a: '11111111-1111-4111-8111-111111111111',
  b: '22222222-2222-4222-8222-222222222222',
  c: '33333333-3333-4333-8333-333333333333',
  d: '44444444-4444-4444-8444-444444444444',
};

const addPictures = (raw: ReturnType<typeof testDb>['raw']) => {
  const media = raw.prepare(
    `INSERT INTO media_assets (id, r2_key, kind, mime_type, size_bytes, width, height, alt_text, variant_widths)
     VALUES (?, ?, 'image', 'image/webp', 1000, 960, 680, ?, '[480,960]')`,
  );
  media.run(ids.a, `media/${ids.a}/v1/960.webp`, 'Smile before treatment');
  media.run(ids.b, `media/${ids.b}/v1/960.webp`, 'Smile after treatment');
  media.run(ids.c, `media/${ids.c}/v1/960.webp`, 'Another smile before');
  media.run(ids.d, `media/${ids.d}/v1/960.webp`, null);
};

const insertPair =
  "INSERT INTO smile_results (service_id, title, before_image_id, after_image_id, consent_confirmed, sort_order, is_visible) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ?, ?, ?, ?, ?, ?)";

test('a shown pair needs consent and two different pictures, and keeps its pictures from being deleted', () => {
  const { raw } = setup();
  addPictures(raw);
  assert.match(failure(raw, insertPair, 'No consent', ids.a, ids.b, 0, 0, 1), /CHECK/);
  assert.match(failure(raw, insertPair, 'Same picture', ids.a, ids.a, 1, 0, 1), /CHECK/);
  // Hidden pairs can wait for the consent.
  raw.prepare(insertPair).run('Draft', ids.a, ids.b, 0, 0, 0);
  assert.match(failure(raw, 'DELETE FROM media_assets WHERE id = ?', ids.a), /FOREIGN KEY/);
  assert.match(failure(raw, 'DELETE FROM media_assets WHERE id = ?', ids.b), /FOREIGN KEY/);
});

test('the form says why a pair cannot be saved (no consent box: the clinic has it beforehand)', () => {
  assert.deepEqual(
    smileResultErrors({ before_image_id: ids.a, after_image_id: ids.b, is_visible: true }),
    {},
  );
  assert.deepEqual(
    Object.keys(
      smileResultErrors({ before_image_id: ids.a, after_image_id: ids.a, is_visible: true }),
    ),
    ['after_image_id'],
  );
});

test('the snapshot has the shown, consented pairs in order, without their admin names', async () => {
  const { raw, db } = setup();
  addPictures(raw);
  const pair = raw.prepare(insertPair);
  pair.run('Second', ids.c, ids.b, 1, 2, 1);
  pair.run('First', ids.a, ids.b, 1, 1, 1);
  pair.run('Hidden', ids.a, ids.c, 1, 0, 0);
  pair.run('Waiting for consent', ids.b, ids.c, 0, 0, 0);

  const snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.smileResults?.map((p) => [p.before.key, p.after.key]),
    [
      [`media/${ids.a}/v1/960.webp`, `media/${ids.b}/v1/960.webp`],
      [`media/${ids.c}/v1/960.webp`, `media/${ids.b}/v1/960.webp`],
    ],
  );
  assert.equal(JSON.stringify(snapshot.smileResults).includes('First'), false);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), []);
});

test('no pair, no smileResults; a picture without a description blocks the publish', async () => {
  const { raw, db } = setup();
  addPictures(raw);
  assert.equal('smileResults' in (await buildSnapshot(db)), false);

  raw.prepare(insertPair).run('Pair', ids.a, ids.d, 1, 0, 1);
  assert.deepEqual(snapshotProblems(await buildSnapshot(db)), [
    'Service pages: smile results, pair 1: the after photo has no description. Add one in Media.',
  ]);
});

test('a snapshot with a malformed pair is refused', () => {
  const image = {
    key: 'media/x/v1/960.webp',
    width: 960,
    height: 680,
    alt: 'x',
    decorative: false,
    widths: [960],
  };
  assert.equal(isSnapshot({ smileResults: [{ before: image, after: image }] }), true);
  assert.equal(isSnapshot({ smileResults: [{ before: image }] }), false);
  assert.equal(isSnapshot({ smileResults: {} }), false);
});

test('results are attached to their service, exclude hidden services and cannot outlive their service', async () => {
  const { raw, db } = setup();
  addPictures(raw);
  raw.exec(
    "INSERT INTO services (id, slug, title) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'crowns', 'Crowns')",
  );
  raw.prepare(insertPair).run('Implant case', ids.a, ids.b, 1, 0, 1);
  raw
    .prepare(
      "INSERT INTO smile_results (service_id, title, before_image_id, after_image_id, consent_confirmed) VALUES (?, 'Crowns case', ?, ?, 1)",
    )
    .run('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ids.c, ids.b);
  let snapshot = await buildSnapshot(db);
  assert.deepEqual(snapshot.smileResults?.map((p) => p.serviceSlug).sort(), [
    'crowns',
    'dental-implants',
  ]);
  assert.match(failure(raw, "DELETE FROM services WHERE slug = 'crowns'"), /FOREIGN KEY/);
  raw.exec("UPDATE services SET is_visible = 0 WHERE slug = 'crowns'");
  snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.smileResults?.map((p) => p.serviceSlug),
    ['dental-implants'],
  );
  assert.equal(
    isSnapshot({ smileResults: [{ ...snapshot.smileResults![0], serviceSlug: 12 }] }),
    false,
  );
});

test('migration preserves shared pairs as independent rows on each existing service', () => {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const dir = new URL('../db/migrations/', import.meta.url);
  for (const file of readdirSync(dir)
    .sort()
    .filter((f) => f < '0026'))
    raw.exec(readFileSync(new URL(file, dir), 'utf8'));
  addPictures(raw);
  raw.exec(
    "INSERT INTO services (id, slug, title) VALUES ('a', 'implants', 'Implants'), ('b', 'crowns', 'Crowns')",
  );
  raw
    .prepare(
      'INSERT INTO smile_results (title, before_image_id, after_image_id, consent_confirmed, sort_order) VALUES (?, ?, ?, 1, 7)',
    )
    .run('Legacy case', ids.a, ids.b);
  raw.exec(readFileSync(new URL('0026_service_smile_results.sql', dir), 'utf8'));
  const rows = raw
    .prepare(
      'SELECT id, service_id, before_image_id, sort_order FROM smile_results ORDER BY service_id',
    )
    .all();
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.service_id),
    ['a', 'b'],
  );
  assert.notEqual(rows[0].id, rows[1].id);
  assert.ok(rows.every((r) => r.before_image_id === ids.a && r.sort_order === 7));
  raw.prepare('UPDATE smile_results SET is_visible = 0 WHERE service_id = ?').run('a');
  assert.equal(
    raw.prepare("SELECT is_visible FROM smile_results WHERE service_id = 'b'").get()!.is_visible,
    1,
  );
});
