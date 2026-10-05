// Admin-only. Resizes the chosen image into WebP files in the browser, then uploads them. R2 does not
// resize images, and doing it here also drops EXIF data (camera, location) before anything leaves the
// computer. The server re-checks every file; nothing here is trusted.
const WIDTHS = [480, 960, 1600];
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

const form = document.querySelector<HTMLFormElement>('form[data-media-upload]');

if (form) {
  const fileInput = form.elements.namedItem('file') as HTMLInputElement;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = form.querySelector<HTMLElement>('[data-status]')!;

  const show = (message: string, kind: 'ok' | 'error') => {
    status.textContent = message;
    status.dataset.kind = kind;
  };

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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) return show('Choose an image first.', 'error');
    if (!ACCEPTED.includes(file.type)) return show('Use a JPEG, PNG or WebP image.', 'error');
    if (file.size > MAX_SOURCE_BYTES) return show('This image is larger than 25 MB.', 'error');

    button.disabled = true;
    show('Preparing the image…', 'ok');
    try {
      const bitmap = await createImageBitmap(file);
      const widths = WIDTHS.filter((w) => w <= bitmap.width);
      if (widths.length === 0) {
        return show(
          `This image is only ${bitmap.width}px wide. Use one at least ${WIDTHS[0]}px wide.`,
          'error',
        );
      }

      const body = new FormData();
      body.set('alt_text', String(new FormData(form).get('alt_text') ?? ''));
      if ((form.elements.namedItem('is_decorative') as HTMLInputElement).checked) {
        body.set('is_decorative', 'on');
      }
      for (const width of widths) {
        const blob = await encode(bitmap, width);
        if (!blob || blob.type !== 'image/webp') {
          return show(
            'This browser cannot create WebP images. Please use Chrome, Edge or Firefox.',
            'error',
          );
        }
        body.set(`w${width}`, blob, `${width}.webp`);
      }
      bitmap.close();

      show('Uploading…', 'ok');
      const response = await fetch('/admin/media/upload', { method: 'POST', body });
      const data = (await response.json().catch(() => null)) as {
        ok: boolean;
        id?: string;
        error?: string;
      } | null;
      if (response.ok && data?.ok && data.id) {
        location.href = `/admin/media/${data.id}?uploaded=1`;
        return;
      }
      show(data?.error ?? 'Upload failed. Please try again.', 'error');
    } catch {
      show('Could not read this image. Try a different file.', 'error');
    } finally {
      button.disabled = false;
    }
  });
}
