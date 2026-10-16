// Admin-only. A form whose request takes a few seconds (Publish, Build again) shows that it is working: the
// submit button is disabled, gets a spinner (admin.css, `[aria-busy='true']`) and the text of its
// `data-busy-label`. The form still submits the normal way, so nothing changes without JS, and a second click
// cannot send it twice.
const forms = document.querySelectorAll<HTMLFormElement>('form[data-busy-form]');

const reset = (button: HTMLButtonElement) => {
  const label = button.querySelector<HTMLElement>('[data-label]');
  if (label && button.dataset.idleLabel) label.textContent = button.dataset.idleLabel;
  button.removeAttribute('aria-busy');
  button.disabled = false;
};

for (const form of forms) {
  form.addEventListener('submit', (event) => {
    const button =
      (event.submitter as HTMLButtonElement | null) ??
      form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!button) return;
    if (button.getAttribute('aria-busy') === 'true') {
      event.preventDefault();
      return;
    }
    const label = button.querySelector<HTMLElement>('[data-label]');
    if (label && button.dataset.busyLabel) {
      button.dataset.idleLabel = label.textContent ?? '';
      label.textContent = button.dataset.busyLabel;
    }
    button.setAttribute('aria-busy', 'true');
    // Disabled after the submit event has started the request, so the form is still sent.
    button.disabled = true;
  });
}

// Coming back with the Back button can show the page from the browser's cache, still busy: undo that.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    'form[data-busy-form] button[aria-busy="true"]',
  )) {
    reset(button);
  }
});
