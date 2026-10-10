import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageLink } from '../src/lib/links.ts';
import { directionsUrl } from '../src/lib/maps.ts';
import { createDb } from '../src/lib/db.ts';
import { buildSnapshot, isSnapshot, snapshotProblems } from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

test('a page without its own consultation block sends #consultation to the Home page form', () => {
  assert.equal(pageLink('#consultation', true), '#consultation');
  assert.equal(pageLink('#consultation', false), '/#consultation');
  // Other links are never touched.
  for (const href of ['/about', '#other', 'https://example.com/#consultation', '/#consultation']) {
    assert.equal(pageLink(href, false), href);
    assert.equal(pageLink(href, true), href);
  }
});

test('directions are a map search for the address, safely encoded', () => {
  assert.equal(
    directionsUrl('26 Doan Thi Diem, O Cho Dua Ward, Ha Noi'),
    'https://www.google.com/maps/search/?api=1&query=26%20Doan%20Thi%20Diem%2C%20O%20Cho%20Dua%20Ward%2C%20Ha%20Noi',
  );
  assert.equal(
    directionsUrl('  A &  B\n#1 '),
    'https://www.google.com/maps/search/?api=1&query=A%20%26%20B%20%231',
  );
  for (const v of [null, undefined, '', '   \n']) assert.equal(directionsUrl(v), null);
});

const setup = () => {
  const { raw, sql } = testDb();
  return { raw, db: createDb(sql, { actorId: 'admin-1', audit: true }) };
};
const media = (raw: ReturnType<typeof testDb>['raw'], o: Record<string, unknown>) => {
  const row = {
    id: 'm1',
    r2_key: 'media/m1/v1/video.mp4',
    kind: 'video',
    mime_type: 'video/mp4',
    size_bytes: 10,
    width: 1280,
    height: 720,
    alt_text: 'The clinic tour',
    status: 'active',
    ...o,
  };
  const cols = Object.keys(row);
  raw
    .prepare(
      `INSERT INTO media_assets (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    )
    .run(...(Object.values(row) as never[]));
};
const site = (raw: ReturnType<typeof testDb>['raw'], video: string | null) =>
  raw
    .prepare('INSERT INTO site_settings (id, site_name, intro_video_id) VALUES (1, ?, ?)')
    .run('Clinic', video);

test('the chosen Home video goes into the snapshot with its cover image', async () => {
  const { raw, db } = setup();
  media(raw, {
    id: 'p1',
    r2_key: 'media/00000000-0000-4000-8000-000000000001/v1/960.webp',
    kind: 'image',
    mime_type: 'image/webp',
    width: 960,
    height: 540,
    alt_text: 'Cover picture',
    variant_widths: '[960]',
  });
  media(raw, { poster_asset_id: 'p1' });
  site(raw, 'm1');
  const snapshot = await buildSnapshot(db);
  assert.equal(snapshot.site?.video?.key, 'media/m1/v1/video.mp4');
  assert.equal(snapshot.site?.video?.title, 'The clinic tour');
  assert.equal(snapshot.site?.video?.poster?.alt, 'Cover picture');
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), []);
});

test('no video chosen, or an archived or non-video asset: the snapshot has none', async () => {
  const none = setup();
  site(none.raw, null);
  assert.equal((await buildSnapshot(none.db)).site?.video, undefined);

  const archived = setup();
  media(archived.raw, { status: 'archived' });
  site(archived.raw, 'm1');
  assert.equal((await buildSnapshot(archived.db)).site?.video, undefined);

  const image = setup();
  media(image.raw, { kind: 'image', r2_key: 'media/m1/v1/480.webp', mime_type: 'image/webp' });
  site(image.raw, 'm1');
  assert.equal((await buildSnapshot(image.db)).site?.video, undefined);
});

test('a video without a description blocks publishing', async () => {
  const { raw, db } = setup();
  media(raw, { alt_text: null });
  site(raw, 'm1');
  const problems = snapshotProblems(await buildSnapshot(db));
  assert.ok(problems.some((p) => p.includes('Home page video') && p.includes('no description')));
});

test('a video in use cannot be deleted, and the snapshot check rejects a malformed video', () => {
  const { raw } = setup();
  media(raw, {});
  site(raw, 'm1');
  assert.match(failure(raw, "DELETE FROM media_assets WHERE id = 'm1'"), /FOREIGN KEY/);
  assert.equal(isSnapshot({ site: { name: 'x', video: { key: 5 } } }), false);
  assert.equal(isSnapshot({ site: { name: 'x', video: null } }), true);
  assert.equal(isSnapshot({ site: { name: 'x' } }), true);
});
