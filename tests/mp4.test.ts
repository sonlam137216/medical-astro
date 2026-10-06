import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMp4Head } from '../src/lib/mp4.ts';

function box(type: string, payloadSize: number, brand?: string) {
  const b = new Uint8Array(8 + payloadSize);
  new DataView(b.buffer).setUint32(0, b.length);
  b.set(
    [...type].map((c) => c.charCodeAt(0)),
    4,
  );
  if (brand)
    b.set(
      [...brand].map((c) => c.charCodeAt(0)),
      8,
    );
  return b;
}
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

test('a fast-start MP4 is accepted (index before picture data)', () => {
  assert.deepEqual(
    checkMp4Head(join(box('ftyp', 16, 'isom'), box('moov', 100), box('mdat', 500))),
    {
      ok: true,
    },
  );
  // free space before the index is normal
  assert.deepEqual(checkMp4Head(join(box('ftyp', 16, 'mp42'), box('free', 40), box('moov', 100))), {
    ok: true,
  });
});

test('an MP4 whose picture data comes first is refused with a fast-start hint', () => {
  assert.deepEqual(
    checkMp4Head(join(box('ftyp', 16, 'isom'), box('mdat', 500), box('moov', 100))),
    {
      ok: false,
      reason: 'not-faststart',
    },
  );
});

test('other files are not MP4', () => {
  assert.deepEqual(checkMp4Head(new TextEncoder().encode('GIF89a......................')), {
    ok: false,
    reason: 'not-mp4',
  });
  // QuickTime container, and a box with an impossible size
  assert.equal(checkMp4Head(join(box('ftyp', 16, 'qt  '), box('moov', 10))).ok, false);
  const bad = join(box('ftyp', 16, 'isom'), new Uint8Array(8));
  assert.deepEqual(checkMp4Head(bad), { ok: false, reason: 'not-mp4' });
  assert.equal(checkMp4Head(new Uint8Array(4)).ok, false);
});
