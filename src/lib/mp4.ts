// Checks the start of an uploaded video file. The browser says it is an MP4; this reads the file's own
// boxes instead of trusting that. A video must be "fast start" (the index, `moov`, before the picture data,
// `mdat`), otherwise a browser has to download the whole file before it can play or seek.

const ascii = (b: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...b.subarray(start, end));

// ISO base media brands that browsers play as MP4. QuickTime ('qt  ') is a different container.
const BRANDS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ']);

export type Mp4Check = { ok: true } | { ok: false; reason: 'not-mp4' | 'not-faststart' };

/** `head` is the first bytes of the file (64 KB is plenty: `moov` follows `ftyp` in a fast-start file). */
export function checkMp4Head(head: Uint8Array): Mp4Check {
  if (head.length < 12 || ascii(head, 4, 8) !== 'ftyp' || !BRANDS.has(ascii(head, 8, 12))) {
    return { ok: false, reason: 'not-mp4' };
  }
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  let offset = 0;
  // Walk the top-level boxes until the index or the picture data shows up.
  while (offset + 8 <= head.length) {
    let size = view.getUint32(offset);
    const type = ascii(head, offset + 4, offset + 8);
    if (type === 'moov') return { ok: true };
    if (type === 'mdat') return { ok: false, reason: 'not-faststart' };
    if (size === 1) {
      if (offset + 16 > head.length) break;
      size = Number(view.getBigUint64(offset + 8));
    }
    if (size < 8) return { ok: false, reason: 'not-mp4' };
    offset += size;
  }
  // Neither box inside the part we looked at: the leading boxes are unusually large. Do not guess.
  return { ok: true };
}
