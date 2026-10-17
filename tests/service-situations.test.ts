import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { situationErrors } from '../src/lib/cms/service-situations.ts';
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
  'INSERT INTO service_situations (service_id, tag, title, description, before_image_id, after_image_id, consent_confirmed, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

test('pictures are a pair of two, need consent when shown, and keep their service and pictures', () => {
  const { raw } = setup();
  addPictures(raw);
  const service = addService(raw);
  assert.match(failure(raw, insert, service, null, 'One', null, ids.a, null, 1, 0, 1), /CHECK/);
  assert.match(failure(raw, insert, service, null, 'Same', null, ids.a, ids.a, 1, 0, 1), /CHECK/);
  assert.match(
    failure(raw, insert, service, null, 'No consent', null, ids.a, ids.b, 0, 0, 1),
    /CHECK/,
  );
  assert.match(failure(raw, insert, service, null, '', null, null, null, 0, 0, 1), /CHECK/);
  // A card without pictures needs no consent; a hidden card can wait for it.
  assert.equal(failure(raw, insert, service, null, 'Text only', null, null, null, 0, 0, 1), '');
  assert.equal(failure(raw, insert, service, null, 'Draft', null, ids.a, ids.b, 0, 0, 0), '');
  assert.match(failure(raw, 'DELETE FROM media_assets WHERE id = ?', ids.a), /FOREIGN KEY/);
  assert.match(failure(raw, 'DELETE FROM services WHERE id = ?', service), /FOREIGN KEY/);
  assert.match(
    failure(raw, 'UPDATE services SET situations_label = ? WHERE id = ?', 'x'.repeat(121), service),
    /CHECK/,
  );
});

test('the form says why the pictures cannot be saved or shown', () => {
  const shown = { is_visible: true, consent_confirmed: true };
  assert.deepEqual(situationErrors({ ...shown, before_image_id: null, after_image_id: null }), {});
  assert.deepEqual(
    situationErrors({ ...shown, before_image_id: ids.a, after_image_id: ids.b }),
    {},
  );
  assert.deepEqual(Object.keys(situationErrors({ ...shown, before_image_id: ids.a })), [
    'after_image_id',
  ]);
  assert.deepEqual(Object.keys(situationErrors({ ...shown, after_image_id: ids.b })), [
    'before_image_id',
  ]);
  assert.deepEqual(
    Object.keys(situationErrors({ ...shown, before_image_id: ids.a, after_image_id: ids.a })),
    ['after_image_id'],
  );
  assert.deepEqual(
    Object.keys(
      situationErrors({
        is_visible: true,
        consent_confirmed: false,
        before_image_id: ids.a,
        after_image_id: ids.b,
      }),
    ),
    ['consent_confirmed'],
  );
  assert.deepEqual(
    situationErrors({
      is_visible: false,
      consent_confirmed: false,
      before_image_id: ids.a,
      after_image_id: ids.b,
    }),
    {},
  );
});

test('the snapshot has each service’s shown cards in order, pictures only when consented and usable', async () => {
  const { raw, db } = setup();
  addPictures(raw);
  const implants = addService(raw, 'dental-implants', 'Implant treatment options');
  const veneers = addService(raw, 'veneers', '   ');
  const card = raw.prepare(insert);
  card.run(implants, 'A full arch', 'All-on-4', 'Text.', null, null, 0, 2, 1);
  card.run(implants, 'One missing tooth', 'Single implant', null, ids.a, ids.b, 1, 1, 1);
  card.run(implants, null, 'Hidden', null, null, null, 0, 0, 0);
  // Consented, but one picture was archived: the card stays, without pictures.
  card.run(veneers, null, 'Archived picture', null, ids.a, ids.b, 1, 0, 1);
  raw.prepare("UPDATE media_assets SET status = 'archived' WHERE id = ?").run(ids.b);

  const snapshot = await buildSnapshot(db);
  const [first, second] = snapshot.services ?? [];
  assert.equal(first.situationsLabel, 'Implant treatment options');
  assert.deepEqual(
    first.situations?.map((s) => [s.tag, s.title, s.description]),
    [
      ['One missing tooth', 'Single implant', null],
      ['A full arch', 'All-on-4', 'Text.'],
    ],
  );
  assert.equal(first.situations?.[0].before, undefined); // the after picture is archived
  assert.equal('situationsLabel' in second, false); // blank label: the shared one
  assert.deepEqual(second.situations?.[0], {
    tag: null,
    title: 'Archived picture',
    description: null,
  });
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
});

test('pictures reach the snapshot as a pair; one without a description blocks the publish', async () => {
  const { raw, db } = setup();
  addPictures(raw);
  const service = addService(raw);
  raw.prepare(insert).run(service, null, 'Single implant', null, ids.a, ids.c, 1, 0, 1);
  const snapshot = await buildSnapshot(db);
  const situation = snapshot.services?.[0].situations?.[0];
  assert.equal(situation?.before?.key, `media/${ids.a}/v1/960.webp`);
  assert.equal(situation?.after?.key, `media/${ids.c}/v1/960.webp`);
  assert.deepEqual(snapshotProblems(snapshot), [
    'Service “dental-implants”, situation “Single implant”: the after picture has no description. Add one in Media.',
  ]);
});

test('a service without cards keeps its old shape; a malformed card is refused', async () => {
  const { raw, db } = setup();
  addService(raw);
  const [service] = (await buildSnapshot(db)).services ?? [];
  assert.equal('situations' in service, false);
  assert.equal('situationsLabel' in service, false);

  const base = { slug: 's', title: 'S', image: null };
  assert.equal(isSnapshot({ services: [{ ...base, situations: [{ title: 'A' }] }] }), true);
  assert.equal(isSnapshot({ services: [{ ...base, situations: [{ tag: 'x' }] }] }), false);
  assert.equal(
    isSnapshot({ services: [{ ...base, situations: [{ title: 'A', before: {} }] }] }),
    false,
  );
  assert.equal(isSnapshot({ services: [{ ...base, situationsLabel: 3 }] }), false);
});
