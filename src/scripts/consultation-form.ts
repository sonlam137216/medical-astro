// Progressive enhancement for every consultation form: submit in place and show the result
// without leaving the page. Without JS the form still POSTs and the endpoint answers with a page.
type ApiReply = { ok: boolean; message: string; errors?: Record<string, string> };

document.querySelectorAll<HTMLFormElement>('form[data-form="consultation"]').forEach((form) => {
  const status = form.querySelector<HTMLElement>('[data-status]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const idField = form.elements.namedItem('submission_id') as HTMLInputElement | null;
  if (!status || !button || !idField) return;

  // A fresh id per form render and after each success. A retry of the same attempt reuses it, so
  // the server stores it once.
  const newId = () => (idField.value = crypto.randomUUID());
  newId();

  const show = (message: string, kind: 'ok' | 'error') => {
    status.textContent = message;
    status.dataset.kind = kind;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));

    button.disabled = true;
    show('Sending…', 'ok');
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: new URLSearchParams(new FormData(form) as unknown as Record<string, string>),
      });
      const data = (await response.json().catch(() => null)) as ApiReply | null;

      if (response.ok && data?.ok) {
        form.reset();
        newId();
        show(data.message, 'ok');
      } else if (response.status === 422 && data?.errors) {
        for (const field of Object.keys(data.errors)) {
          form.querySelector(`[name="${field}"]`)?.setAttribute('aria-invalid', 'true');
        }
        show(Object.values(data.errors).join(' '), 'error');
      } else {
        show(data?.message ?? 'We could not send your request. Please try again.', 'error');
      }
    } catch {
      show('Network problem. Please check your connection and try again.', 'error');
    } finally {
      button.disabled = false;
    }
  });
});
