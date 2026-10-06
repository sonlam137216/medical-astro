import { MAX_ALT_LENGTH, MAX_UPLOAD_BYTES, MAX_VARIANT_BYTES, VARIANT_WIDTHS } from './media';
import { readWebp } from './webp';

// Server-side check of an image upload. The browser resizes and re-encodes the image into WebP files
// (see src/scripts/media-upload.ts); nothing it says is trusted, so every file is re-read here.

export interface UploadedVariant {
  width: number;
  height: number;
  bytes: Uint8Array;
}

export interface ParsedUpload {
  variants: UploadedVariant[]; // ascending by width
  altText: string | null;
  isDecorative: boolean;
}

export type UploadResult =
  { ok: true; value: ParsedUpload } | { ok: false; status: number; error: string };

const fail = (status: number, error: string): UploadResult => ({ ok: false, status, error });

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

/** Alt text is required unless the image is decorative; a decorative image may still carry a note. */
export function readAlt(
  raw: string,
  isDecorative: boolean,
  noun: 'image' | 'video' = 'image',
): { ok: true; altText: string | null } | { ok: false; error: string } {
  const alt = raw.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (alt.length > MAX_ALT_LENGTH) {
    return { ok: false, error: `Keep the description under ${MAX_ALT_LENGTH} characters.` };
  }
  if (!isDecorative && alt === '') {
    return {
      ok: false,
      error:
        noun === 'video'
          ? 'Describe what the video shows, for people who cannot see it.'
          : 'Describe the image for people who cannot see it, or mark it as decorative.',
    };
  }
  return { ok: true, altText: alt === '' ? null : alt };
}

export async function parseUpload(request: Request): Promise<UploadResult> {
  const length = Number(request.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0) return fail(411, 'Missing request size.');
  if (length > MAX_UPLOAD_BYTES) return fail(413, 'The upload is too large.');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'Could not read the upload.');
  }

  const isDecorative = form.has('is_decorative');
  const alt = readAlt(String(form.get('alt_text') ?? ''), isDecorative);
  if (!alt.ok) return fail(422, alt.error);

  const variants: UploadedVariant[] = [];
  for (const width of VARIANT_WIDTHS) {
    const file = form.get(`w${width}`);
    if (file === null) continue;
    if (typeof file === 'string') return fail(400, 'Invalid image field.');
    if (file.size === 0 || file.size > MAX_VARIANT_BYTES) {
      return fail(413, 'An image file is empty or too large after resizing.');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = readWebp(bytes);
    if (!info) return fail(415, 'Only WebP images are accepted.');
    if (info.width !== width) return fail(422, 'Image size does not match its label.');
    variants.push({ width, height: info.height, bytes });
  }

  // The browser may only produce sizes up to the source width, so a small image has one file. It must
  // have at least one, and every size must be the same picture (same aspect ratio, 2px rounding).
  if (variants.length === 0) return fail(422, 'Choose an image.');
  const largest = variants[variants.length - 1];
  for (const v of variants) {
    const expected = Math.round((largest.height * v.width) / largest.width);
    if (Math.abs(v.height - expected) > 2) return fail(422, 'Image sizes do not match each other.');
  }

  return { ok: true, value: { variants, altText: alt.altText, isDecorative } };
}
