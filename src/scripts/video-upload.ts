// Admin-only. Sends the chosen MP4 as it is (the server does not convert videos) with a progress bar.
// The server checks the file itself; the picture size read here only reserves space on the page.
// Keep in step with MAX_VIDEO_BYTES (src/lib/media.ts).
const MAX_BYTES = 80 * 1024 * 1024;

export {};

const form = document.querySelector<HTMLFormElement>('form[data-video-upload]');

if (form) {
  const fileInput = form.elements.namedItem('file') as HTMLInputElement;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = form.querySelector<HTMLElement>('[data-status]')!;
  const progress = form.querySelector<HTMLProgressElement>('[data-progress]')!;

  const show = (message: string, kind: 'ok' | 'error') => {
    status.textContent = message;
    status.dataset.kind = kind;
  };

  const readSize = (file: File) =>
    new Promise<{ width: number; height: number } | null>((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      const done = (size: { width: number; height: number } | null) => {
        URL.revokeObjectURL(url);
        resolve(size);
      };
      video.preload = 'metadata';
      video.onloadedmetadata = () => done({ width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => done(null);
      video.src = url;
    });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) return show('Choose a video first.', 'error');
    if (file.type !== 'video/mp4') return show('Use an MP4 video.', 'error');
    if (file.size > MAX_BYTES) {
      return show(
        `This video is larger than ${MAX_BYTES / 1024 / 1024} MB. Compress it first.`,
        'error',
      );
    }

    button.disabled = true;
    show('Preparing…', 'ok');
    const size = await readSize(file);
    const data = new FormData(form);
    const query = new URLSearchParams({ alt_text: String(data.get('alt_text') ?? '') });
    const poster = String(data.get('poster') ?? '');
    if (poster) query.set('poster', poster);
    if (size) {
      query.set('width', String(size.width));
      query.set('height', String(size.height));
    }

    const request = new XMLHttpRequest();
    request.open('POST', `/admin/media/upload-video?${query}`);
    request.setRequestHeader('content-type', 'video/mp4');
    progress.hidden = false;
    request.upload.onprogress = (e) => {
      if (e.lengthComputable) progress.value = Math.round((e.loaded / e.total) * 100);
    };
    request.onload = () => {
      let body: { ok?: boolean; id?: string; error?: string } | null;
      try {
        body = JSON.parse(request.responseText);
      } catch {
        body = null;
      }
      if (request.status === 200 && body?.ok && body.id) {
        location.href = `/admin/media/${body.id}?uploaded=1`;
        return;
      }
      progress.hidden = true;
      button.disabled = false;
      show(body?.error ?? 'Upload failed. Please try again.', 'error');
    };
    request.onerror = () => {
      progress.hidden = true;
      button.disabled = false;
      show('Upload failed. Check your connection and try again.', 'error');
    };
    show('Uploading…', 'ok');
    request.send(file);
  });
}
