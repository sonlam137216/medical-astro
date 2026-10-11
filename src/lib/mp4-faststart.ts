// Moves the index (`moov`) of an MP4 to the front of the file, in the browser, so a video exported the usual way
// (index at the end) can be uploaded: the server only accepts "fast start" files, which start playing before they
// have fully downloaded. Nothing is re-encoded: the boxes are only reordered, and the chunk offsets inside the
// index are shifted by the size of the index. The picture data is never read into memory (the result is a Blob
// made of slices of the original). Pure code: runs on any Blob, so it is unit-tested with Node.

export type Faststart =
  { kind: 'already' } | { kind: 'fixed'; blob: Blob } | { kind: 'failed'; reason: string };

interface Box {
  type: string;
  start: number;
  size: number;
}

const text = (view: DataView, at: number) =>
  String.fromCharCode(
    view.getUint8(at),
    view.getUint8(at + 1),
    view.getUint8(at + 2),
    view.getUint8(at + 3),
  );

/** The top-level boxes of the file, in order. Null when the structure is not a plain MP4. */
async function topLevelBoxes(blob: Blob): Promise<Box[] | null> {
  const boxes: Box[] = [];
  let offset = 0;
  while (offset < blob.size) {
    if (blob.size - offset < 8) return null;
    const head = new DataView(await blob.slice(offset, offset + 16).arrayBuffer());
    let size = head.getUint32(0);
    const type = text(head, 4);
    if (size === 1) {
      if (head.byteLength < 16) return null;
      size = Number(head.getBigUint64(8));
    } else if (size === 0) {
      size = blob.size - offset; // runs to the end of the file
    }
    if (size < 8 || offset + size > blob.size) return null;
    boxes.push({ type, start: offset, size });
    offset += size;
  }
  return boxes;
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

/** Adds `delta` to every chunk offset (stco / co64) found inside the index, in place. False if one would overflow. */
function shiftOffsets(view: DataView, start: number, end: number, delta: number): boolean {
  let at = start;
  while (at + 8 <= end) {
    let size = view.getUint32(at);
    const type = text(view, at + 4);
    let body = at + 8;
    if (size === 1) {
      size = Number(view.getBigUint64(at + 8));
      body = at + 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < 8 || at + size > end) return false;
    if (CONTAINERS.has(type)) {
      if (!shiftOffsets(view, body, at + size, delta)) return false;
    } else if (type === 'stco') {
      const count = view.getUint32(body + 4);
      if (body + 8 + count * 4 > at + size) return false;
      for (let i = 0; i < count; i++) {
        const pos = body + 8 + i * 4;
        const next = view.getUint32(pos) + delta;
        if (next > 0xffffffff) return false;
        view.setUint32(pos, next);
      }
    } else if (type === 'co64') {
      const count = view.getUint32(body + 4);
      if (body + 8 + count * 8 > at + size) return false;
      for (let i = 0; i < count; i++) {
        const pos = body + 8 + i * 8;
        view.setBigUint64(pos, view.getBigUint64(pos) + BigInt(delta));
      }
    }
    at += size;
  }
  return true;
}

export async function makeFaststart(blob: Blob): Promise<Faststart> {
  const boxes = await topLevelBoxes(blob);
  if (!boxes || boxes.length < 2 || boxes[0].type !== 'ftyp') {
    return { kind: 'failed', reason: 'This is not a plain MP4 file.' };
  }
  const moovAt = boxes.findIndex((b) => b.type === 'moov');
  const mdatAt = boxes.findIndex((b) => b.type === 'mdat');
  if (moovAt < 0 || mdatAt < 0)
    return { kind: 'failed', reason: 'The video has no index or no picture data.' };
  if (boxes.some((b) => b.type === 'moof')) {
    return { kind: 'failed', reason: 'Fragmented MP4 files cannot be prepared here.' };
  }
  if (moovAt < mdatAt) return { kind: 'already' };

  const moov = boxes[moovAt];
  const bytes = new Uint8Array(await blob.slice(moov.start, moov.start + moov.size).arrayBuffer());
  const view = new DataView(bytes.buffer);
  const headerSize = view.getUint32(0) === 1 ? 16 : 8;
  if (!shiftOffsets(view, headerSize, bytes.length, moov.size)) {
    return { kind: 'failed', reason: 'The video index could not be adjusted.' };
  }

  const piece = (b: Box) => blob.slice(b.start, b.start + b.size);
  const parts: BlobPart[] = [piece(boxes[0]), bytes];
  boxes.forEach((b, i) => {
    if (i !== 0 && i !== moovAt) parts.push(piece(b));
  });
  return { kind: 'fixed', blob: new Blob(parts, { type: 'video/mp4' }) };
}
