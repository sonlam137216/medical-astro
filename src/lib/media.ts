// Shared by the admin (upload, library) and the public build (image URLs). Safe to import anywhere:
// no Worker or Node APIs.

/** Widths the browser generates before upload. An image only gets the sizes up to its own width. */
export const VARIANT_WIDTHS = [480, 960, 1600] as const;

export const MAX_VARIANT_BYTES = 1_500_000;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_ALT_LENGTH = 500;

// Videos are one plain MP4 file (no transcoding, no streaming service). Uploads go through a Worker, whose
// request body limit is 100 MB, so stay well under it.
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

// media/<asset id>/v<version>/<width>.webp. The version changes whenever the file is replaced, so a
// cached old image can never be served for new content.
const KEY_RE =
  /^media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/v(\d+)\/(\d+)\.webp$/;

const VIDEO_KEY_RE =
  /^media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/v(\d+)\/video\.mp4$/;

export function variantKey(assetId: string, version: number, width: number) {
  return `media/${assetId}/v${version}/${width}.webp`;
}

export function parseKey(key: string): { assetId: string; version: number; width: number } | null {
  const m = KEY_RE.exec(key);
  return m ? { assetId: m[1], version: Number(m[2]), width: Number(m[3]) } : null;
}

export function videoKey(assetId: string, version: number) {
  return `media/${assetId}/v${version}/video.mp4`;
}

export function isVideoKey(key: string): boolean {
  return VIDEO_KEY_RE.test(key);
}

/** Every file the CMS itself writes: the only keys the public media route may serve. */
export function isServableKey(key: string): boolean {
  return parseKey(key) !== null || isVideoKey(key);
}

/** Keys of every stored file of an asset, derived from the largest file's key. */
export function allVariantKeys(r2Key: string, widths: number[]): string[] {
  const parsed = parseKey(r2Key);
  if (!parsed) return [r2Key];
  const keys = widths.map((w) => variantKey(parsed.assetId, parsed.version, w));
  return keys.includes(r2Key) ? keys : [...keys, r2Key];
}

/** Key of the smallest stored file: used for thumbnails in the admin. */
export function thumbnailKey(r2Key: string, widths: number[]): string {
  const parsed = parseKey(r2Key);
  const smallest = widths.length > 0 ? Math.min(...widths) : null;
  return parsed && smallest ? variantKey(parsed.assetId, parsed.version, smallest) : r2Key;
}

/**
 * Where a stored file is fetched from. With a public base URL (custom domain on the R2 bucket) the
 * browser talks to R2 directly; without one the Worker route /media/* serves it (local dev, staging).
 */
export function mediaUrl(key: string, publicBase?: string | null): string {
  const base = (publicBase ?? '').replace(/\/+$/, '');
  return base ? `${base}/${key}` : `/${key}`;
}

export interface MediaImageInput {
  r2_key: string;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  is_decorative: boolean;
  variant_widths: number[];
}

export interface PublicImage {
  url: string;
  srcset: string;
  width: number;
  height: number;
  /** Empty for decorative images. */
  alt: string;
}

/** A ready-to-render image (largest file as the fallback `src`, every width in `srcset`). */
export function toPublicImage(
  asset: MediaImageInput,
  publicBase?: string | null,
): PublicImage | null {
  const parsed = parseKey(asset.r2_key);
  if (!parsed || !asset.width || !asset.height) return null;
  const widths = [...asset.variant_widths].sort((a, b) => a - b);
  const srcset = widths
    .map((w) => `${mediaUrl(variantKey(parsed.assetId, parsed.version, w), publicBase)} ${w}w`)
    .join(', ');
  return {
    url: mediaUrl(asset.r2_key, publicBase),
    srcset,
    width: asset.width,
    height: asset.height,
    alt: asset.is_decorative ? '' : (asset.alt_text ?? ''),
  };
}

export interface MediaVideoInput {
  r2_key: string;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  poster: MediaImageInput | null;
}

export interface PublicVideo {
  url: string;
  /** Shown until the visitor presses play. Absent: the browser shows the first frame. */
  poster?: PublicImage;
  /** Declared size of the picture (from the browser at upload time), used to reserve space. */
  width: number | null;
  height: number | null;
  /** What the video is about, for people who cannot see it. */
  title: string;
}

export function toPublicVideo(
  asset: MediaVideoInput,
  publicBase?: string | null,
): PublicVideo | null {
  if (!isVideoKey(asset.r2_key)) return null;
  return {
    url: mediaUrl(asset.r2_key, publicBase),
    poster: (asset.poster && toPublicImage(asset.poster, publicBase)) || undefined,
    width: asset.width,
    height: asset.height,
    title: asset.alt_text ?? '',
  };
}

export type ReadRange = { offset?: number; length?: number; suffix?: number };

/** First and last byte (inclusive) of the part R2 returned for a Range request, or null if it is outside the file. */
export function contentRange(
  range: ReadRange,
  size: number,
): { start: number; end: number } | null {
  if (size <= 0) return null;
  let start: number;
  let end: number;
  if (range.suffix !== undefined) {
    start = Math.max(0, size - range.suffix);
    end = size - 1;
  } else {
    start = range.offset ?? 0;
    end = range.length !== undefined ? start + range.length - 1 : size - 1;
  }
  end = Math.min(end, size - 1);
  return start <= end && start < size ? { start, end } : null;
}

/** True when a `Range: bytes=N-…` header starts at or after the end of a file of `size` bytes. */
export function startsBeyond(header: string | null, size: number): boolean {
  const m = /^bytes=(\d+)-/.exec(header ?? '');
  return m !== null && Number(m[1]) >= size;
}
