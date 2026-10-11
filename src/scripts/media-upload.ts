// Admin-only. The "Upload an image" form of the Media page (the picker window in the other forms uses the same
// code: media-client.ts).
import { uploadImage } from './media-client';

const form = document.querySelector<HTMLFormElement>('form[data-media-upload]');

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
      const result = await uploadImage(
        file,
        String(new FormData(form).get('alt_text') ?? ''),
        (form.elements.namedItem('is_decorative') as HTMLInputElement).checked,
        (message) => show(message, 'ok'),
      );
      if (result.ok) {
        location.href = `/admin/media/${result.item.id}?uploaded=1`;
        return;
      }
      show(result.error, 'error');
    } finally {
      button.disabled = false;
    }
  });
}
