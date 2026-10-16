import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { IMAGE_SLOTS } from '../src/lib/image-slots.ts';
import { buildSnapshot, isSnapshot, snapshotProblems } from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

const setup = () => {
  const { raw, sql } = testDb();
  return { raw, db: createDb(sql, { actorId: 'admin-1', audit: true }) };
};

test('a page keeps its banner and its share picture apart; the banner needs a description', async () => {
  const { raw, db } = setup();
  const media = raw.prepare(
    `INSERT INTO media_assets (id, r2_key, kind, mime_type, size_bytes, width, height, alt_text, variant_widths)
     VALUES (?, ?, 'image', 'image/webp', 1000, ?, ?, ?, '[480,960,1600]')`,
  );
  const share = '11111111-1111-4111-8111-111111111111';
  const wide = '22222222-2222-4222-8222-222222222222';
  media.run(share, `media/${share}/v1/960.webp`, 960, 504, 'The clinic');
  media.run(wide, `media/${wide}/v1/1600.webp`, 1600, 444, null);
  const page = raw.prepare(
    'INSERT INTO pages (path, title, og_image_id, hero_image_id) VALUES (?, ?, ?, ?)',
  );
  page.run('/about', 'About us', share, wide);
  page.run('/services', 'Services', null, null);

  const snapshot = await buildSnapshot(db);
  const about = snapshot.pages?.find((p) => p.path === '/about');
  const services = snapshot.pages?.find((p) => p.path === '/services');
  assert.equal(about?.shareImage?.key, `media/${share}/v1/960.webp`);
  assert.equal(about?.heroImage?.key, `media/${wide}/v1/1600.webp`);
  assert.equal(services && 'heroImage' in services, false); // only when chosen
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), [
    'Page “About us”: the banner picture has no description. Add one in Media, or mark the image as decorative.',
  ]);
  // A picture in use as a banner cannot be deleted.
  assert.match(failure(raw, 'DELETE FROM media_assets WHERE id = ?', wide), /FOREIGN KEY/);
});

test('a snapshot page with a malformed banner is refused', () => {
  const page = { path: '/about', title: 'About', seoTitle: null, seoDescription: null };
  assert.equal(isSnapshot({ pages: [{ ...page, noindex: false }] }), true);
  assert.equal(isSnapshot({ pages: [{ ...page, noindex: false, heroImage: 'x' }] }), false);
});

test('Home’s first screen asks for a taller picture than the other banners', () => {
  const ratio = (k: 'home-hero' | 'page-banner') =>
    IMAGE_SLOTS[k].frames[0].width / IMAGE_SLOTS[k].frames[0].height;
  assert.ok(ratio('home-hero') < ratio('page-banner'));
});
