// The placeholder colour of a picture: its average colour, painted behind the picture while the file loads.
// Pure code, shared by the upload (browser) and the server check.

const HEX = /^#[0-9a-f]{6}$/;

/** A lower-case '#rrggbb' colour, or null. */
export function readColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return HEX.test(v) ? v : null;
}

/**
 * Average colour of RGBA pixel data (as from canvas getImageData), or null when the picture has transparency:
 * a coloured box behind a cut-out would show through, so those pictures get no placeholder colour.
 */
export function averageColor(rgba: ArrayLike<number>): string | null {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  let seeThrough = 0;
  for (let i = 0; i < pixels; i++) {
    r += rgba[i * 4];
    g += rgba[i * 4 + 1];
    b += rgba[i * 4 + 2];
    if (rgba[i * 4 + 3] < 250) seeThrough++;
  }
  if (seeThrough / pixels > 0.02) return null;
  const hex = (sum: number) =>
    Math.round(sum / pixels)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
