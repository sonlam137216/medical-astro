// Admin-only. The "Upload a video" form of the Media page, with a progress bar (the picker window in the other
// forms uses the same code: media-client.ts).
import { uploadVideo } from './media-client';

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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) return show('Choose a video first.', 'error');

    button.disabled = true;
    progress.hidden = false;
    const data = new FormData(form);
    const result = await uploadVideo(file, {
      altText: String(data.get('alt_text') ?? ''),
      poster: String(data.get('poster') ?? '') || undefined,
      onProgress: (percent) => (progress.value = percent),
      onStatus: (message) => show(message, 'ok'),
    });
    if (result.ok) {
      location.href = `/admin/media/${result.item.id}?uploaded=1`;
      return;
    }
    progress.hidden = true;
    button.disabled = false;
    show(result.error, 'error');
  });
}
