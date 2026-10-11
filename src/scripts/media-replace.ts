// Admin-only. The "Replace the picture" form of an image's page: the new file is resized in the browser like any
// upload (media-client.ts) and then takes the place of the old one.
import { replaceImage } from './media-client';

const form = document.querySelector<HTMLFormElement>('form[data-media-replace]');

if (form) {
  const fileInput = form.elements.namedItem('file') as HTMLInputElement;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = form.querySelector<HTMLElement>('[data-status]')!;
  const show = (message: string, kind: 'ok' | 'error') => {
    status.textContent = message;
    status.dataset.kind = kind;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) return show('Choose an image first.', 'error');
    button.disabled = true;
    try {
      const result = await replaceImage(form.dataset.id ?? '', file, (m) => show(m, 'ok'));
      if (result.ok) {
        location.href = `${location.pathname}?replaced=1`;
        return;
      }
      show(result.error, 'error');
    } finally {
      button.disabled = false;
    }
  });
}
