import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFaststart } from '../src/lib/mp4-faststart.ts';
import { checkMp4Head } from '../src/lib/mp4.ts';
import { bitrateMbps, coverMismatch, videoWarnings } from '../src/lib/video-advice.ts';

// ---- a tiny MP4 made of real boxes ---------------------------------------------------------------------
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u64 = (n: number) => [...u32(Math.floor(n / 2 ** 32)), ...u32(n >>> 0)];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const box = (type: string, ...body: number[][]) => {
  const payload = body.flat();
  return [...u32(8 + payload.length), ...ascii(type), ...payload];
};

const ftyp = box('ftyp', ascii('isom'), u32(512), ascii('isom'), ascii('mp41'));
const payload = ascii('PICTURE-DATA-0123456789');
const free = box('free', [0, 0, 0, 0]);

/** moov with one track whose chunk table (stco or co64) points at `offset`. */
function moov(offset: number, wide = false) {
  const table = wide
    ? box('co64', u32(0), u32(1), u64(offset))
    : box('stco', u32(0), u32(1), u32(offset));
  return box('moov', box('trak', box('mdia', box('minf', box('stbl', table)))));
}

/** [ftyp][free][mdat][moov]: the usual layout of a video straight out of an editor. */
function slowStart(wide = false) {
  const mdat = box('mdat', payload);
  const dataAt = ftyp.length + free.length + 8;
  const file = [...ftyp, ...free, ...mdat];
  const tail = moov(dataAt, wide);
  return { bytes: new Uint8Array([...file, ...tail]), dataAt, moovSize: tail.length };
}

async function bytesOf(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}
const find = (bytes: Uint8Array, needle: number[]) => {
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
};

test('a file with the index at the end is rewritten to fast start, picture data untouched', async () => {
  const { bytes, dataAt, moovSize } = slowStart();
  assert.deepEqual(checkMp4Head(bytes), { ok: false, reason: 'not-faststart' });

  const result = await makeFaststart(new Blob([bytes]));
  assert.equal(result.kind, 'fixed');
  if (result.kind !== 'fixed') return;
  const fixed = await bytesOf(result.blob);

  assert.equal(fixed.length, bytes.length);
  assert.deepEqual(checkMp4Head(fixed), { ok: true });
  // The picture data is where the chunk table now says it is.
  const newDataAt = dataAt + moovSize;
  assert.equal(find(fixed, payload), newDataAt);
  const stco = find(fixed, ascii('stco'));
  const view = new DataView(fixed.buffer);
  assert.equal(view.getUint32(stco + 4 + 4 + 4), newDataAt);
  // Second pass: nothing left to do.
  assert.deepEqual(await makeFaststart(result.blob), { kind: 'already' });
});

test('64-bit chunk tables are shifted too', async () => {
  const { bytes, dataAt, moovSize } = slowStart(true);
  const result = await makeFaststart(new Blob([bytes]));
  assert.equal(result.kind, 'fixed');
  if (result.kind !== 'fixed') return;
  const fixed = await bytesOf(result.blob);
  const at = find(fixed, ascii('co64')) + 4 + 4 + 4;
  const view = new DataView(fixed.buffer);
  assert.equal(Number(view.getBigUint64(at)), dataAt + moovSize);
  assert.equal(find(fixed, payload), dataAt + moovSize);
});

test('a file that is already fast start is left alone', async () => {
  const mdat = box('mdat', payload);
  const m = moov(ftyp.length + 8 + 0);
  const bytes = new Uint8Array([...ftyp, ...m, ...mdat]);
  assert.deepEqual(await makeFaststart(new Blob([bytes])), { kind: 'already' });
});

test('anything that is not a plain MP4 is refused, not guessed at', async () => {
  const cases: Record<string, number[]> = {
    'not a video': ascii('this is not an mp4 file at all'),
    'no index': [...ftyp, ...box('mdat', payload)],
    'broken box size': [...ftyp, ...u32(9999), ...ascii('mdat'), 1, 2],
    fragmented: [...ftyp, ...box('mdat', payload), ...box('moof', [0]), ...moov(0)],
    'too short': [0, 0, 0],
  };
  for (const [name, bytes] of Object.entries(cases)) {
    const result = await makeFaststart(new Blob([new Uint8Array(bytes)]));
    assert.equal(result.kind, 'failed', name);
  }
});

test('a chunk offset that would not fit in 32 bits is not silently wrapped', async () => {
  const mdat = box('mdat', payload);
  const m = moov(0xfffffff0);
  const result = await makeFaststart(new Blob([new Uint8Array([...ftyp, ...mdat, ...m])]));
  assert.equal(result.kind, 'failed');
});

// ---- advice --------------------------------------------------------------------------------------------
test('bit rate in megabits per second', () => {
  assert.equal(bitrateMbps(10_000_000, 20), 4);
  assert.equal(bitrateMbps(10_000_000, null), null);
  assert.equal(bitrateMbps(10_000_000, 0), null);
});

test('a reasonable web video gets no advice', () => {
  const facts = { width: 1280, height: 720, duration: 30, bytes: 10_000_000 };
  assert.deepEqual(videoWarnings(facts), []);
  // Unknown details are not guessed at.
  assert.deepEqual(videoWarnings({ width: null, height: null, duration: null, bytes: 1 }), []);
});

test('big, heavy and portrait videos are flagged', () => {
  const big = videoWarnings({ width: 3840, height: 2160, duration: 30, bytes: 10_000_000 });
  assert.match(big.join(' '), /3840 × 2160/);
  const heavy = videoWarnings({ width: 1280, height: 720, duration: 10, bytes: 40_000_000 });
  assert.match(heavy.join(' '), /32\.0 Mbps/);
  const tall = videoWarnings({ width: 720, height: 1280, duration: 30, bytes: 10_000_000 });
  assert.match(tall.join(' '), /portrait/);
  // 1080 x 1920 is a normal phone video: only the portrait note.
  assert.equal(
    videoWarnings({ width: 1080, height: 1920, duration: 30, bytes: 5_000_000 }).length,
    1,
  );
});

test('a cover with other proportions than the video is noticed', () => {
  const video = { width: 1280, height: 720 };
  assert.equal(coverMismatch(video, { width: 1600, height: 900 }), false);
  assert.equal(coverMismatch(video, { width: 1600, height: 1067 }), true);
  assert.equal(coverMismatch(video, { width: null, height: null }), false);
});
