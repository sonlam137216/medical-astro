// Reads the pixel size of a WebP file from its header, so the server can check what the browser says it
// uploaded instead of trusting it. Handles the three WebP encodings (lossy, lossless, extended).

export interface WebpInfo {
  width: number;
  height: number;
}

const ascii = (b: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...b.subarray(start, end));

export function readWebp(b: Uint8Array): WebpInfo | null {
  // RIFF header: 'RIFF' size 'WEBP', then the first chunk.
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 12) !== 'WEBP') return null;
  // The RIFF size field counts everything after the first 8 bytes. A mismatch means a cut-off file.
  const riffSize = b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] * 2 ** 24);
  if (riffSize + 8 > b.length) return null;

  const chunk = ascii(b, 12, 16);
  let width: number;
  let height: number;

  if (chunk === 'VP8 ') {
    // Lossy: 3-byte frame tag, start code 9d 01 2a, then 14-bit width and height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    width = (b[26] | (b[27] << 8)) & 0x3fff;
    height = (b[28] | (b[29] << 8)) & 0x3fff;
  } else if (chunk === 'VP8L') {
    // Lossless: signature byte 0x2f, then 14-bit width-1 and height-1 packed together.
    if (b[20] !== 0x2f) return null;
    width = 1 + (((b[22] & 0x3f) << 8) | b[21]);
    height = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6));
  } else if (chunk === 'VP8X') {
    // Extended: 24-bit canvas width-1 and height-1.
    width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
  } else {
    return null;
  }

  return width > 0 && height > 0 ? { width, height } : null;
}
