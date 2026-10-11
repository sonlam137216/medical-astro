// Admin-only. The browser side of uploading to the media library, shared by the Media page and by the picker
// window in the forms. Images are resized into WebP files here (R2 does not resize, and redrawing on a canvas
// also drops EXIF data such as camera and location before anything leaves the computer). Videos are sent as
// they are. The server re-checks every file; nothing here is trusted. Keep the limits in step with
// src/lib/media.ts.
const IMAGE_WIDTHS = [480, 960, 1600];
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface UploadedMedia {
  id: string;
  /** Small picture for the new item (a video without a cover image has none). */
  thumb: string | null;
  label: string;
}
export type UploadResult = { ok: true; item: UploadedMedia } | { ok: false; error: string };

interface Reply {
  ok?: boolean;
  id?: string;
  error?: string;
  thumb?: string | null;
  label?: string;
}
const toResult = (status: number, reply: Reply | null): UploadResult =>
  status === 200 && reply?.ok && reply.id
    ? {
        ok: true,
        item: {
          id: reply.id,
          thumb: reply.thumb ?? null,
          label: reply.label ?? 'No description yet',
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

export async function uploadImage(
  file: File,
  altText: string,
  decorative: boolean,
  onStatus: (message: string) => void = () => undefined,
): Promise<UploadResult> {
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
    body.set('alt_text', altText);
    if (decorative) body.set('is_decorative', 'on');
    for (const width of widths) {
      const blob = await encode(bitmap, width);
      if (!blob || blob.type !== 'image/webp') {
        return fail('This browser cannot create WebP images. Please use Chrome, Edge or Firefox.');
      }
      body.set(`w${width}`, blob, `${width}.webp`);
    }
    onStatus('Uploading…');
    const response = await fetch('/admin/media/upload', { method: 'POST', body });
    return toResult(response.status, (await response.json().catch(() => null)) as Reply | null);
  } finally {
    bitmap.close();
  }
}

const fail = (error: string): UploadResult => ({ ok: false, error });

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
