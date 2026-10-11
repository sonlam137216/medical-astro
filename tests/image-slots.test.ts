import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_SLOTS,
  fitReport,
  fitWarnings,
  frameAspect,
  frameStyle,
  isSlotKey,
  minimumWidth,
  ratioLabel,
  recommendedSize,
  slotHint,
  slotRatio,
  toFocus,
} from '../src/lib/image-slots.ts';
import { snapshotImageInput, toPublicImage, variantKey } from '../src/lib/media.ts';
import { toSnapshotImage } from '../src/lib/snapshot.ts';
import { createDb } from '../src/lib/db.ts';
import { testDb } from './helpers/sqlite.ts';

const card = IMAGE_SLOTS['service-card'];
const doctor = IMAGE_SLOTS.doctor;

test('ratios have readable names', () => {
  assert.equal(ratioLabel(3 / 2), '3:2');
  assert.equal(ratioLabel(16 / 9), '16:9');
  assert.equal(ratioLabel(384 / 190), '2:1');
  assert.equal(ratioLabel(1.1), '1.10:1');
  assert.equal(ratioLabel(0.5), '1:2.00');
});

test('every slot has sane frames and a size to upload', () => {
  for (const [key, slot] of Object.entries(IMAGE_SLOTS)) {
    assert.ok(isSlotKey(key));
    const { width, height } = recommendedSize(slot);
    assert.ok([960, 1600].includes(width), key);
    assert.ok(Math.abs(width / height - slotRatio(slot)) < 0.01, key);
    assert.ok(minimumWidth(slot) < width, key);
    for (const frame of slot.frames) assert.ok(frame.width > 0 && frame.height > 0, key);
    assert.ok(slot.position.x >= 0 && slot.position.x <= 100 && slot.position.y <= 100, key);
  }
  assert.equal(isSlotKey('nope'), false);
  assert.equal(isSlotKey('toString'), false);
});

test('a picture in the right proportions needs no warning', () => {
  const size = { width: 960, height: Math.round(960 / slotRatio(card)) };
  assert.deepEqual(fitWarnings(card, size), []);
  assert.equal(fitReport(card, size).cropPercent, 0);
});

test('a very different shape warns how much is cut and from where', () => {
  // A tall portrait in a wide card: top and bottom are cut.
  const tall = fitReport(card, { width: 1000, height: 1500 });
  assert.equal(tall.cropped, 'top and bottom');
  assert.ok(tall.cropPercent > 60);
  assert.match(fitWarnings(card, { width: 1000, height: 1500 })[0], /top and bottom/);
  // A panorama in a nearly square card: the sides are cut.
  const wide = fitReport(IMAGE_SLOTS['home-conversations'], { width: 1600, height: 400 });
  assert.equal(wide.cropped, 'sides');
  // A small difference is not worth a warning.
  assert.deepEqual(fitWarnings(card, { width: 1000, height: 460 }), []);
});

test('a small picture is flagged, a big one is not', () => {
  assert.equal(fitReport(card, { width: 400, height: 198 }).small, true);
  assert.equal(fitReport(card, { width: minimumWidth(card), height: 290 }).small, false);
  assert.match(fitWarnings(card, { width: 400, height: 198 }).join(' '), /blurry/);
});

test('with several frames the worst one counts', () => {
  // Square: fine for the doctor cards (about 1:1) but cut a lot in the tall profile frame.
  const report = fitReport(doctor, { width: 1000, height: 1000 });
  assert.ok(report.cropPercent > 30);
  assert.equal(report.cropped, 'sides');
});

test('the hint names the shape, sizes and places', () => {
  const hint = slotHint(card);
  assert.match(hint, /2:1/);
  assert.match(hint, /960 × 475/);
  assert.match(hint, /580 px/);
  assert.match(slotHint(doctor), /Our Doctors page; Doctor cards/);
});

test('focus points are whole percentages inside the picture', () => {
  assert.deepEqual(toFocus(0, 100), { x: 0, y: 100 });
  assert.deepEqual(toFocus(37, 20), { x: 37, y: 20 });
  for (const bad of [
    [-1, 5],
    [5, 101],
    [1.5, 5],
    [null, 5],
    ['5', '5'],
    [NaN, 5],
  ] as const) {
    assert.equal(toFocus(bad[0], bad[1]), null, JSON.stringify(bad));
  }
});

test('the frame CSS uses the focus point, or the slot default', () => {
  assert.equal(
    frameStyle(card),
    'aspect-ratio: 384 / 190; object-fit: cover; object-position: 50% 0%',
  );
  assert.match(frameStyle(card, { x: 30, y: 70 }), /object-position: 30% 70%/);
  assert.equal(frameAspect(doctor, 1), '282 / 280');
  assert.equal(frameAspect(doctor, 9), '282 / 422');
});

const ID = '0b8f1d52-6c1e-4f6a-8d63-2f4a7c1e9b10';
const asset = {
  r2_key: variantKey(ID, 1, 960),
  width: 960,
  height: 576,
  alt_text: 'x',
  is_decorative: false,
  variant_widths: [480, 960],
};

test('a public image carries the focus point only when one is set', () => {
  assert.equal(toPublicImage(asset)!.focus, undefined);
  assert.equal(toPublicImage({ ...asset, focal_x: null, focal_y: null })!.focus, undefined);
  assert.equal(toPublicImage({ ...asset, focal_x: 40, focal_y: null })!.focus, undefined);
  assert.deepEqual(toPublicImage({ ...asset, focal_x: 40, focal_y: 15 })!.focus, { x: 40, y: 15 });
});

test('the focus point survives the snapshot', () => {
  const row = { ...asset, focal_x: 62, focal_y: 18, status: 'active' };
  const image = toSnapshotImage(row)!;
  assert.deepEqual(image.focus, { x: 62, y: 18 });
  assert.deepEqual(toPublicImage(snapshotImageInput(image))!.focus, { x: 62, y: 18 });
  // Without a focus point the snapshot is exactly what it was before this feature (same hash).
  const plain = toSnapshotImage({ ...row, focal_x: null, focal_y: null })!;
  assert.equal('focus' in plain, false);
});

test('the database keeps focus points inside 0-100 and records changes', async () => {
  const { raw, sql } = testDb();
  const db = createDb(sql, { actorId: null, audit: true });
  raw.exec(
    `insert into media_assets (id, r2_key, kind, mime_type, size_bytes, width, height) values ('${ID}', 'media/${ID}/v1/960.webp', 'image', 'image/webp', 10, 960, 576)`,
  );
  const ok = await db.from('media_assets').update({ focal_x: 25, focal_y: 75 }).eq('id', ID);
  assert.equal(ok.error, null);
  const bad = await db.from('media_assets').update({ focal_x: 101 }).eq('id', ID);
  assert.ok(bad.error);
  const { data } = await db.from('media_assets').select('focal_x, focal_y').eq('id', ID).single();
  assert.deepEqual(data, { focal_x: 25, focal_y: 75 });
  const cleared = await db
    .from('media_assets')
    .update({ focal_x: null, focal_y: null })
    .eq('id', ID);
  assert.equal(cleared.error, null);
});
