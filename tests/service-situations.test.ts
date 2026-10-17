import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb } from '../src/lib/db.ts';
import { situationPictureErrors } from '../src/lib/cms/service-situations.ts';
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
};

type Raw = ReturnType<typeof testDb>['raw'];

const addPictures = (raw: Raw) => {
  const media = raw.prepare(
    `INSERT INTO media_assets (id, r2_key, kind, mime_type, size_bytes, width, height, alt_text, variant_widths)
     VALUES (?, ?, 'image', 'image/webp', 1000, 960, 674, ?, '[480,960]')`,
  );
  media.run(ids.a, `media/${ids.a}/v1/960.webp`, 'X-ray before an implant');
  media.run(ids.b, `media/${ids.b}/v1/960.webp`, 'X-ray after an implant');
  media.run(ids.c, `media/${ids.c}/v1/960.webp`, null);
};

const addService = (raw: Raw, slug = 'dental-implants', label: string | null = null) =>
  (
    raw
      .prepare('INSERT INTO services (slug, title, situations_label) VALUES (?, ?, ?) RETURNING id')
      .get(slug, slug, label) as { id: string }
  ).id;

const insert =
  'INSERT INTO service_situations (service_id, tag, title, description, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?)';

const setPictures =
  'UPDATE services SET situations_before_image_id = ?, situations_after_image_id = ?, situations_consent_confirmed = ? WHERE id = ?';

test('a situation belongs to one service, which cannot be deleted while it has situations', () => {
  const { raw } = setup();
  const service = addService(raw);
  assert.equal(failure(raw, insert, service, null, 'Single implant', null, 0, 1), '');
  assert.match(failure(raw, insert, service, null, '', null, 0, 1), /CHECK/);
  assert.match(failure(raw, insert, crypto.randomUUID(), null, 'X', null, 0, 1), /FOREIGN KEY/);
  assert.match(failure(raw, 'DELETE FROM services WHERE id = ?', service), /FOREIGN KEY/);
  assert.match(
    failure(raw, 'UPDATE services SET situations_label = ? WHERE id = ?', 'x'.repeat(121), service),
    /CHECK/,
  );
});

test('the service’s pictures are a pair of two, need consent, and cannot be deleted while used', () => {
  const { raw } = setup();
  addPictures(raw);
  const service = addService(raw);
  assert.match(failure(raw, setPictures, ids.a, null, 1, service), /CHECK/);
  assert.match(failure(raw, setPictures, ids.a, ids.a, 1, service), /CHECK/);
  assert.match(failure(raw, setPictures, ids.a, ids.b, 0, service), /CHECK/);
  assert.equal(failure(raw, setPictures, ids.a, ids.b, 1, service), '');
  assert.match(failure(raw, 'DELETE FROM media_assets WHERE id = ?', ids.a), /FOREIGN KEY/);
  // Removing the pictures needs no consent.
  assert.equal(failure(raw, setPictures, null, null, 0, service), '');
});

test('the form says why the pictures cannot be saved', () => {
  const pair = (before: string | null, after: string | null, consent: boolean) =>
    Object.keys(
      situationPictureErrors({
        situations_before_image_id: before,
        situations_after_image_id: after,
        situations_consent_confirmed: consent,
      }),
    );
  assert.deepEqual(pair(null, null, false), []);
  assert.deepEqual(pair(ids.a, ids.b, true), []);
  assert.deepEqual(pair(ids.a, null, true), ['situations_after_image_id']);
  assert.deepEqual(pair(null, ids.b, true), ['situations_before_image_id']);
  assert.deepEqual(pair(ids.a, ids.a, true), ['situations_after_image_id']);
  assert.deepEqual(pair(ids.a, ids.b, false), ['situations_consent_confirmed']);
});

test('the snapshot has each service’s shown cards in order and one picture pair', async () => {
  const { raw, db } = setup();
  addPictures(raw);
  const implants = addService(raw, 'dental-implants', 'Implant treatment options');
  const veneers = addService(raw, 'veneers', '   ');
  const card = raw.prepare(insert);
  card.run(implants, 'A full arch', 'All-on-4', 'Text.', 2, 1);
  card.run(implants, 'One missing tooth', 'Single implant', null, 1, 1);
  card.run(implants, null, 'Hidden', null, 0, 0);
  card.run(veneers, null, 'Veneers card', null, 0, 1);
  raw.prepare(setPictures).run(ids.a, ids.b, 1, implants);

  const snapshot = await buildSnapshot(db);
  const [first, second] = snapshot.services ?? [];
  assert.equal(first.situationsLabel, 'Implant treatment options');
  assert.deepEqual(first.situations, [
    { tag: 'One missing tooth', title: 'Single implant', description: null },
    { tag: 'A full arch', title: 'All-on-4', description: 'Text.' },
  ]);
  assert.equal(first.situationsImages?.before.key, `media/${ids.a}/v1/960.webp`);
  assert.equal(first.situationsImages?.after.key, `media/${ids.b}/v1/960.webp`);
  assert.equal('situationsLabel' in second, false); // blank label: the shared one
  assert.equal('situationsImages' in second, false);
  assert.deepEqual(snapshotProblems(snapshot), []);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);

  // An archived picture: the cards stay, without pictures.
  raw.prepare("UPDATE media_assets SET status = 'archived' WHERE id = ?").run(ids.b);
  const later = await buildSnapshot(db);
  assert.equal('situationsImages' in (later.services?.[0] ?? {}), false);
  assert.equal(later.services?.[0].situations?.length, 2);
});

test('a picture without a description blocks the publish', async () => {
  const { raw, db } = setup();
  addPictures(raw);
  const service = addService(raw);
  raw.prepare(insert).run(service, null, 'Single implant', null, 0, 1);
  raw.prepare(setPictures).run(ids.a, ids.c, 1, service);
  assert.deepEqual(snapshotProblems(await buildSnapshot(db)), [
    'Service “dental-implants”: the “Which treatment fits” after picture has no description. Add one in Media.',
  ]);
});

test('a service without cards or pictures keeps its old shape; malformed ones are refused', async () => {
  const { raw, db } = setup();
  addService(raw);
  const [service] = (await buildSnapshot(db)).services ?? [];
  for (const key of ['situations', 'situationsLabel', 'situationsImages'])
    assert.equal(key in service, false);

  const image = {
    key: 'media/x/v1/960.webp',
    width: 960,
    height: 674,
    alt: 'x',
    decorative: false,
  };
  const base = { slug: 's', title: 'S', image: null };
  assert.equal(isSnapshot({ services: [{ ...base, situations: [{ title: 'A' }] }] }), true);
  assert.equal(isSnapshot({ services: [{ ...base, situations: [{ tag: 'x' }] }] }), false);
  assert.equal(
    isSnapshot({ services: [{ ...base, situationsImages: { before: image, after: image } }] }),
    true,
  );
  assert.equal(isSnapshot({ services: [{ ...base, situationsImages: { before: image } }] }), false);
  assert.equal(isSnapshot({ services: [{ ...base, situationsLabel: 3 }] }), false);
  // Older revisions had a pair per card: still a valid snapshot (the pair is ignored).
  assert.equal(
    isSnapshot({
      services: [{ ...base, situations: [{ title: 'A', before: image, after: image }] }],
    }),
    true,
  );
});

test('the migration copies the first consented pair of each service from its cards', () => {
  // On a fresh database the cards' old picture columns still exist (0017); 0019 has already run, so its copy step
  // is replayed here on prepared data.
  const { raw } = setup();
  addPictures(raw);
  const service = addService(raw);
  raw
    .prepare(
      'INSERT INTO service_situations (service_id, title, before_image_id, after_image_id, consent_confirmed, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(service, 'Second', ids.b, ids.a, 1, 2, 1);
  raw
    .prepare(
      'INSERT INTO service_situations (service_id, title, before_image_id, after_image_id, consent_confirmed, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(service, 'First', ids.a, ids.b, 1, 1, 1);
  const migration = readFileSync(
    new URL('../db/migrations/0019_service_situation_pictures.sql', import.meta.url),
    'utf8',
  );
  raw.exec(migration.slice(migration.indexOf('update services')));
  const copied = raw
    .prepare(
      'SELECT situations_before_image_id AS b, situations_after_image_id AS a, situations_consent_confirmed AS c FROM services',
    )
    .get();
  assert.deepEqual({ ...copied }, { b: ids.a, a: ids.b, c: 1 });
});
