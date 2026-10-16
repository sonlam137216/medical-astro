import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { smileResultErrors } from '../src/lib/cms/smile-results.ts';
import { buildSnapshot, isSnapshot, snapshotProblems } from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

const setup = () => {
  const { raw, sql } = testDb();
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
  'INSERT INTO smile_results (title, before_image_id, after_image_id, consent_confirmed, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?)';

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

test('the form says why a pair cannot be shown', () => {
  assert.deepEqual(
    smileResultErrors({
      before_image_id: ids.a,
      after_image_id: ids.b,
      consent_confirmed: true,
      is_visible: true,
    }),
    {},
  );
  assert.deepEqual(
    Object.keys(
      smileResultErrors({
        before_image_id: ids.a,
        after_image_id: ids.a,
        consent_confirmed: false,
        is_visible: true,
      }),
    ).sort(),
    ['after_image_id', 'consent_confirmed'],
  );
  assert.deepEqual(
    smileResultErrors({
      before_image_id: ids.a,
      after_image_id: ids.b,
      consent_confirmed: false,
      is_visible: false,
    }),
    {},
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
    'Smile results, pair 1: the after photo has no description. Add one in Media.',
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
