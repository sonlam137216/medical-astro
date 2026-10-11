// Admin-only. The browser side of uploading to the media library, shared by the Media page and by the picker
// window in the forms. Images are resized into WebP files here (R2 does not resize, and redrawing on a canvas
// also drops EXIF data such as camera and location before anything leaves the computer). Videos are sent as
// they are. The server re-checks every file; nothing here is trusted. Keep the limits in step with
// src/lib/media.ts.
import { averageColor } from '../lib/image-color';

const IMAGE_WIDTHS = [480, 960, 1600];
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface UploadedMedia {
  id: string;
  /** Small picture for the new item (a video without a cover image has none). */
  thumb: string | null;
  label: string;
  /** Pixel size of an uploaded picture (the largest stored file). */
  width?: number;
  height?: number;
}
export type UploadResult = { ok: true; item: UploadedMedia } | { ok: false; error: string };

interface Reply {
  ok?: boolean;
  id?: string;
  error?: string;
  thumb?: string | null;
  label?: string;
  width?: number;
  height?: number;
}
const toResult = (status: number, reply: Reply | null): UploadResult =>
  status === 200 && reply?.ok && reply.id
    ? {
        ok: true,
        item: {
          id: reply.id,
          thumb: reply.thumb ?? null,
          label: reply.label ?? 'No description yet',
          width: reply.width,
          height: reply.height,
        },
      }
    : { ok: false, error: reply?.error ?? 'Upload failed. Please try again.' };

const encode = (bitmap: ImageBitmap, width: number) =>
  new Promise<Blob | null>((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((bitmap.height * width) / bitmap.width);
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(resolve, 'image/webp', 0.82);
  });

const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** SHA-256 of the original file; null where the browser has no Web Crypto (an insecure page). */
const hashFile = async (file: File): Promise<string | null> => {
  try {
    return hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  } catch {
    return null;
  }
};

/** Average colour of the picture (a 16 x 16 redraw is plenty), or null for a picture with transparency. */
const colorOf = (bitmap: ImageBitmap): string | null => {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, 16, 16);
  return averageColor(context.getImageData(0, 0, 16, 16).data);
};

type Prepared = { ok: true; body: FormData } | { ok: false; error: string };

/** The WebP sizes of an image, its colour and its hash, ready to send. */
async function prepareImage(file: File, onStatus: (message: string) => void): Promise<Prepared> {
  if (!IMAGE_TYPES.includes(file.type)) return fail('Use a JPEG, PNG or WebP image.');
  if (file.size > MAX_IMAGE_BYTES) return fail('This image is larger than 25 MB.');

  onStatus('Preparing the image…');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return fail('Could not read this image. Try a different file.');
  }
  try {
    const widths = IMAGE_WIDTHS.filter((w) => w <= bitmap.width);
    if (widths.length === 0) {
      return fail(
        `This image is only ${bitmap.width}px wide. Use one at least ${IMAGE_WIDTHS[0]}px wide.`,
      );
    }
    const body = new FormData();
    for (const width of widths) {
      const blob = await encode(bitmap, width);
      if (!blob || blob.type !== 'image/webp') {
        return fail('This browser cannot create WebP images. Please use Chrome, Edge or Firefox.');
      }
      body.set(`w${width}`, blob, `${width}.webp`);
    }
    const color = colorOf(bitmap);
    if (color) body.set('color', color);
    const hash = await hashFile(file);
    if (hash) body.set('hash', hash);
    return { ok: true, body };
  } finally {
    bitmap.close();
  }
}

export interface DuplicateResult {
  ok: false;
  error: string;
  existing: UploadedMedia;
}
export type ImageUploadResult = UploadResult | DuplicateResult;

export const isDuplicate = (result: { ok: boolean }): result is DuplicateResult =>
  !result.ok && 'existing' in result;

interface DuplicateReply extends Reply {
  duplicate?: {
    id: string;
    thumb: string;
    label: string;
    width: number | null;
    height: number | null;
  };
}

/**
 * Uploads an image. When the same file is already in the library the answer carries `existing` (and nothing
 * was uploaded): offer to use it, or call again with `allowDuplicate` to upload it anyway.
 */
export async function uploadImage(
  file: File,
  altText: string,
  decorative: boolean,
  onStatus: (message: string) => void = () => undefined,
  options: { allowDuplicate?: boolean } = {},
): Promise<ImageUploadResult> {
  const prepared = await prepareImage(file, onStatus);
  if (!prepared.ok) return prepared;
  const { body } = prepared;
  body.set('alt_text', altText);
  if (decorative) body.set('is_decorative', 'on');
  if (options.allowDuplicate) body.set('allow_duplicate', 'on');
  onStatus('Uploading…');
  const response = await fetch('/admin/media/upload', { method: 'POST', body });
  const reply = (await response.json().catch(() => null)) as DuplicateReply | null;
  if (response.status === 409 && reply?.duplicate) {
    const { id, thumb, label, width, height } = reply.duplicate;
    return {
      ok: false,
      error: reply.error ?? 'This picture is already in the library.',
      existing: { id, thumb, label, width: width ?? undefined, height: height ?? undefined },
    };
  }
  return toResult(response.status, reply);
}

/** Puts a new file in place of an image of the library (same description, same places). */
export async function replaceImage(
  id: string,
  file: File,
  onStatus: (message: string) => void = () => undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prepared = await prepareImage(file, onStatus);
  if (!prepared.ok) return prepared;
  onStatus('Uploading…');
  const response = await fetch(`/admin/media/${id}/replace`, {
    method: 'POST',
    body: prepared.body,
  });
  const reply = (await response.json().catch(() => null)) as Reply | null;
  return response.ok && reply?.ok
    ? { ok: true }
    : { ok: false, error: reply?.error ?? 'Upload failed. Please try again.' };
}

const fail = (error: string) => ({ ok: false as const, error });

const readVideoSize = (file: File) =>
  new Promise<{ width: number; height: number } | null>((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    // A file the browser cannot read never reports back: do not wait for it for ever (the size only reserves
    // space on the page; the server checks the file itself).
    const timer = window.setTimeout(() => done(null), 3000);
    const done = (size: { width: number; height: number } | null) => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(size);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => done({ width: video.videoWidth, height: video.videoHeight });
    video.onerror = () => done(null);
    video.src = url;
  });

export async function uploadVideo(
  file: File,
  options: {
    altText: string;
    /** Id of an image of the library, shown before the video plays. */
    poster?: string;
    onProgress?: (percent: number) => void;
    onStatus?: (message: string) => void;
  },
): Promise<UploadResult> {
  if (file.type !== 'video/mp4') return fail('Use an MP4 video.');
  if (file.size > MAX_VIDEO_BYTES) {
    return fail(
      `This video is larger than ${MAX_VIDEO_BYTES / 1024 / 1024} MB. Compress it first.`,
    );
  }
  options.onStatus?.('Preparing…');
  const size = await readVideoSize(file);
  const query = new URLSearchParams({ alt_text: options.altText });
  if (options.poster) query.set('poster', options.poster);
  if (size) {
    query.set('width', String(size.width));
    query.set('height', String(size.height));
  }

  return new Promise<UploadResult>((resolve) => {
    const request = new XMLHttpRequest();
    request.open('POST', `/admin/media/upload-video?${query}`);
    request.setRequestHeader('content-type', 'video/mp4');
    request.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    request.onload = () => {
      let reply: Reply | null;
      try {
        reply = JSON.parse(request.responseText);
      } catch {
        reply = null;
      }
      resolve(toResult(request.status, reply));
    };
    request.onerror = () => resolve(fail('Upload failed. Check your connection and try again.'));
    options.onStatus?.('Uploading…');
    request.send(file);
  });
}
