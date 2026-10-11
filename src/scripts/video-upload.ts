// Admin-only. The "Upload a video" form of the Media page, with a progress bar (the picker window in the other
// forms uses the same code: media-client.ts).
import { uploadVideo } from './media-client';
import { setupVideoCover, type VideoCover } from './video-cover';

const form = document.querySelector<HTMLFormElement>('form[data-video-upload]');

if (form) {
  const fileInput = form.elements.namedItem('file') as HTMLInputElement;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = form.querySelector<HTMLElement>('[data-status]')!;
  const progress = form.querySelector<HTMLProgressElement>('[data-progress]')!;

  const posterSelect = form.querySelector('select[name="poster"]') as unknown as HTMLSelectElement;
  const coverHost = form.querySelector<HTMLElement>('[data-cover-host]')!;
  let cover: VideoCover | null = null;
  // Advice about the chosen file and the cover-frame picker (video-cover.ts).
  fileInput.addEventListener('change', () => {
    cover?.destroy();
    cover = null;
    const chosen = fileInput.files?.[0];
    if (chosen) cover = setupVideoCover(chosen, coverHost, posterSelect);
  });

  const show = (message: string, kind: 'ok' | 'error') => {
    status.textContent = message;
    status.dataset.kind = kind;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) return show('Choose a video first.', 'error');

    button.disabled = true;
    const data = new FormData(form);
    const altText = String(data.get('alt_text') ?? '');
    let poster = posterSelect.value || undefined;
    if (cover) {
      const resolved = await cover.resolvePoster(altText, (message) => show(message, 'ok'));
      if (!resolved.ok) {
        button.disabled = false;
        return show(resolved.error, 'error');
      }
      poster = resolved.posterId;
    }
    progress.hidden = false;
    const result = await uploadVideo(file, {
      altText,
      poster,
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
