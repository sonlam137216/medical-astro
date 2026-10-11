import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averageColor, readColor } from '../src/lib/image-color.ts';
import { CLEANUP_GRACE_DAYS, planCleanup } from '../src/lib/media-cleanup.ts';
import { toPublicImage, snapshotImageInput, variantKey, videoKey } from '../src/lib/media.ts';
import { toSnapshotImage } from '../src/lib/snapshot.ts';
import { createDb } from '../src/lib/db.ts';
import { testDb } from './helpers/sqlite.ts';

const A = '0b8f1d52-6c1e-4f6a-8d63-2f4a7c1e9b10';
const B = '1c9f2e63-7d2f-4a7b-9e74-3a5b8d2f0c21';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 11);

test('colours are read strictly', () => {
  assert.equal(readColor('#A1B2C3'), '#a1b2c3');
  assert.equal(readColor(' #00ff00 '), '#00ff00');
  for (const bad of ['#fff', 'red', '#12345g', 'url(x)', '#1234567', null, undefined, 5]) {
    assert.equal(readColor(bad), null, String(bad));
  }
});

test('the average colour of opaque pixels; none for transparent pictures', () => {
  // Two pixels: pure red and pure blue -> (128, 0, 128).
  assert.equal(averageColor([255, 0, 0, 255, 0, 0, 255, 255]), '#800080');
  assert.equal(averageColor([0, 0, 0, 255]), '#000000');
  assert.equal(averageColor([]), null);
  // A cut-out: half of the pixels are see-through.
  assert.equal(averageColor([10, 10, 10, 255, 10, 10, 10, 0]), null);
  // A stray slightly transparent pixel in a big picture does not matter.
  const big = Array.from({ length: 100 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 100));
  big[3] = 200;
  assert.equal(averageColor(big), '#646464');
});

test('the colour travels from the database row to the public image, only when valid', () => {
  const row = {
    r2_key: variantKey(A, 1, 960),
    width: 960,
    height: 576,
    alt_text: 'x',
    is_decorative: false,
    variant_widths: [480, 960],
    status: 'active',
    focal_x: null,
    focal_y: null,
    dominant_color: '#336699',
  };
  const snap = toSnapshotImage(row)!;
  assert.equal(snap.color, '#336699');
  assert.equal(toPublicImage(snapshotImageInput(snap))!.color, '#336699');
  const none = toSnapshotImage({ ...row, dominant_color: null })!;
  assert.equal('color' in none, false);
  assert.equal(toPublicImage({ ...row, dominant_color: 'javascript:1' })!.color, undefined);
});

test('the database accepts a colour and a hash only in the right shape', async () => {
  const { raw, sql } = testDb();
  const db = createDb(sql, { actorId: null, audit: false });
  const base = { kind: 'image', mime_type: 'image/webp', size_bytes: 1 };
  const hash = 'a'.repeat(64);
  const ok = await db
    .from('media_assets')
    .insert({ ...base, r2_key: 'k1', dominant_color: '#a1b2c3', content_hash: hash });
  assert.equal(ok.error, null);
  const badColor = await db
    .from('media_assets')
    .insert({ ...base, r2_key: 'k2', dominant_color: 'red' });
  assert.ok(badColor.error);
  const badHash = await db
    .from('media_assets')
    .insert({ ...base, r2_key: 'k3', content_hash: 'abc' });
  assert.ok(badHash.error);
  // The same picture twice is allowed (it is advice, not a rule).
  const twice = await db.from('media_assets').insert({ ...base, r2_key: 'k4', content_hash: hash });
  assert.equal(twice.error, null);
  const { data } = await db.from('media_assets').select('id').eq('content_hash', hash);
  assert.equal(data?.length, 2);
  assert.ok(raw);
});

const file = (key: string, ageDays: number, size = 1000) => ({
  key,
  size,
  uploaded: NOW - ageDays * DAY,
});

test('cleanup: only unused files older than the grace period are removed', () => {
  const assets = [
    { r2_key: variantKey(A, 2, 960), kind: 'image', variant_widths: [480, 960] },
    { r2_key: videoKey(B, 1), kind: 'video', variant_widths: [] },
  ];
  const objects = [
    file(variantKey(A, 2, 480), 90), // current version: in use
    file(variantKey(A, 2, 960), 90),
    file(variantKey(A, 1, 480), 90), // replaced long ago: remove
    file(variantKey(A, 1, 960), 5), // replaced recently: wait
    file(videoKey(B, 1), 400), // a video in use
    file(variantKey('2d0a3f74-8e3a-4b8c-8f85-4b6c9e3a1d32', 1, 960), 60, 5000), // no row at all: remove
    file('media/notes.txt', 400), // not ours: never touched
  ];
  const plan = planCleanup(objects, assets, NOW);
  assert.deepEqual(
    plan.remove.map((o) => o.key),
    [variantKey(A, 1, 480), variantKey('2d0a3f74-8e3a-4b8c-8f85-4b6c9e3a1d32', 1, 960)],
  );
  assert.equal(plan.bytes, 6000);
  assert.deepEqual(
    plan.recent.map((o) => o.key),
    [variantKey(A, 1, 960)],
  );
  assert.equal(plan.kept, 4);
});

test('cleanup: the grace period is a hard line, and an empty bucket is fine', () => {
  const key = variantKey(A, 1, 480);
  const edge = (days: number) =>
    planCleanup([{ key, size: 1, uploaded: NOW - days * DAY }], [], NOW).remove.length;
  assert.equal(edge(CLEANUP_GRACE_DAYS - 0.01), 0);
  assert.equal(edge(CLEANUP_GRACE_DAYS + 0.01), 1);
  assert.deepEqual(planCleanup([], [], NOW), { remove: [], recent: [], kept: 0, bytes: 0 });
});
