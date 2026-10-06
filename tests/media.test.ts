import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  allVariantKeys,
  contentRange,
  startsBeyond,
  isServableKey,
  isVideoKey,
  mediaUrl,
  parseKey,
  thumbnailKey,
  toPublicImage,
  toPublicVideo,
  variantKey,
  videoKey,
} from '../src/lib/media.ts';
import { readWebp } from '../src/lib/webp.ts';

const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

test('keys round trip', () => {
  const key = variantKey(ID, 2, 960);
  assert.equal(key, `media/${ID}/v2/960.webp`);
  assert.deepEqual(parseKey(key), { assetId: ID, version: 2, width: 960 });
});

test('only keys the CMS writes are valid', () => {
  for (const bad of [
    '',
    'media/x.webp',
    `media/${ID}/v1/960.png`,
    `media/${ID}/../x/v1/1.webp`,
    `other/${ID}/v1/960.webp`,
    `media/${ID}/v1/abc.webp`,
  ]) {
    assert.equal(parseKey(bad), null, bad);
  }
});

test('all variant keys derive from the largest', () => {
  assert.deepEqual(
    allVariantKeys(variantKey(ID, 1, 1600), [480, 960, 1600]),
    [480, 960, 1600].map((w) => variantKey(ID, 1, w)),
  );
  assert.deepEqual(allVariantKeys('legacy-key', [480]), ['legacy-key']);
  assert.equal(thumbnailKey(variantKey(ID, 1, 1600), [960, 480, 1600]), variantKey(ID, 1, 480));
});

test('urls use the public base when set, the Worker route otherwise', () => {
  const key = variantKey(ID, 1, 480);
  assert.equal(mediaUrl(key), `/${key}`);
  assert.equal(mediaUrl(key, 'https://media.example.com/'), `https://media.example.com/${key}`);
});

test('public image has a srcset and empty alt when decorative', () => {
  const asset = {
    r2_key: variantKey(ID, 1, 960),
    width: 960,
    height: 576,
    alt_text: 'x',
    is_decorative: false,
    variant_widths: [960, 480],
  };
  const img = toPublicImage(asset)!;
  assert.equal(img.srcset, `/media/${ID}/v1/480.webp 480w, /media/${ID}/v1/960.webp 960w`);
  assert.equal(img.alt, 'x');
  assert.equal(toPublicImage({ ...asset, is_decorative: true })!.alt, '');
  assert.equal(toPublicImage({ ...asset, width: null }), null);
});

// WebP header reader, checked against the real images in the project (sizes verified separately with sips).
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.webp') ? [p] : [];
  });

test('readWebp reads the project images and rejects bad input', () => {
  const found = files('src/assets');
  assert.ok(found.length > 5);
  for (const f of found) {
    const info = readWebp(new Uint8Array(readFileSync(f)));
    assert.ok(info && info.width > 0 && info.height > 0, f);
  }
  const ok = new Uint8Array(readFileSync(found[0]));
  assert.equal(readWebp(ok.subarray(0, ok.length - 10)), null, 'truncated');
  assert.equal(readWebp(new Uint8Array(0)), null);
  assert.equal(
    readWebp(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...new Array(40).fill(0)])),
    null,
    'png',
  );
});

test('readWebp reads lossless (VP8L) headers', () => {
  for (const [w, h] of [
    [800, 600],
    [1, 1],
    [16383, 16383],
  ]) {
    const b = new Uint8Array(40);
    b.set([0x52, 0x49, 0x46, 0x46], 0);
    b.set([0x57, 0x45, 0x42, 0x50], 8);
    b.set([0x56, 0x50, 0x38, 0x4c], 12);
    const size = b.length - 8;
    b[4] = size & 255;
    b[5] = (size >> 8) & 255;
    b[20] = 0x2f;
    const v = ((w - 1) | ((h - 1) << 14)) >>> 0;
    b[21] = v & 255;
    b[22] = (v >>> 8) & 255;
    b[23] = (v >>> 16) & 255;
    b[24] = (v >>> 24) & 255;
    assert.deepEqual(readWebp(b), { width: w, height: h });
  }
});

test('video keys are valid media keys, but not image keys', () => {
  const key = videoKey(ID, 1);
  assert.equal(key, `media/${ID}/v1/video.mp4`);
  assert.equal(isVideoKey(key), true);
  assert.equal(parseKey(key), null);
  assert.equal(isServableKey(key), true);
  assert.equal(isServableKey(variantKey(ID, 1, 480)), true);
  for (const bad of [
    `media/${ID}/v1/video.mov`,
    `media/${ID}/v1/other.mp4`,
    `media/${ID}/../video.mp4`,
    `media/${ID}/v1/video.mp4/x`,
    'media/video.mp4',
  ]) {
    assert.equal(isServableKey(bad), false, bad);
  }
  assert.deepEqual(allVariantKeys(key, []), [key]);
});

test('a video is public with its poster', () => {
  const poster = {
    r2_key: variantKey(ID, 1, 960),
    width: 960,
    height: 540,
    alt_text: null,
    is_decorative: true,
    variant_widths: [480, 960],
  };
  const video = toPublicVideo(
    { r2_key: videoKey(ID, 1), width: 1280, height: 720, alt_text: 'Clinic tour', poster },
    'https://media.example.com',
  )!;
  assert.equal(video.url, `https://media.example.com/media/${ID}/v1/video.mp4`);
  assert.equal(video.title, 'Clinic tour');
  assert.equal(video.poster?.width, 960);
  assert.equal(
    toPublicVideo({
      r2_key: variantKey(ID, 1, 480),
      width: 1,
      height: 1,
      alt_text: '',
      poster: null,
    }),
    null,
  );
});

test('byte ranges: offset, open end, suffix, outside the file', () => {
  assert.deepEqual(contentRange({ offset: 0, length: 100 }, 1000), { start: 0, end: 99 });
  assert.deepEqual(contentRange({ offset: 900 }, 1000), { start: 900, end: 999 });
  assert.deepEqual(contentRange({ offset: 900, length: 500 }, 1000), { start: 900, end: 999 });
  assert.deepEqual(contentRange({ suffix: 100 }, 1000), { start: 900, end: 999 });
  assert.deepEqual(contentRange({ suffix: 5000 }, 1000), { start: 0, end: 999 });
  assert.equal(contentRange({ offset: 1000 }, 1000), null);
  assert.equal(contentRange({ offset: 0 }, 0), null);
});

test('a Range starting past the end is detected', () => {
  assert.equal(startsBeyond('bytes=1000-', 1000), true);
  assert.equal(startsBeyond('bytes=999-', 1000), false);
  assert.equal(startsBeyond('bytes=-50', 1000), false);
  assert.equal(startsBeyond(null, 1000), false);
});
