// Progressive enhancement for every consultation form: submit in place and show the result
// without leaving the page. Without JS the form still POSTs and the endpoint answers with a page.
// A module (not a plain script), so the global declaration below is allowed.
import { trackGoogleAdsConversion } from './google-ads';

type ApiReply = {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
  conversionId?: string;
};

// Cloudflare Turnstile (optional spam check, see src/lib/turnstile.ts). The widget script is third-party, so it
// is loaded only when someone starts filling in a form, never with the page.
interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId?: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
let turnstileScript: Promise<TurnstileApi> | undefined;
function loadTurnstile(): Promise<TurnstileApi> {
  return (turnstileScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject());
    script.onerror = () => {
      turnstileScript = undefined; // allow a retry on the next focus
      reject();
    };
    document.head.appendChild(script);
  }));
}

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

  // The spam check: created on first focus, answered in the background; a token can be used once, so the
  // widget is reset after every attempt.
  const spamBox = form.querySelector<HTMLElement>('[data-turnstile-sitekey]');
  let widgetId: string | undefined;
  const startSpamCheck = () => {
    if (!spamBox || widgetId !== undefined) return;
    widgetId = ''; // rendering has started
    loadTurnstile().then(
      (api) => {
        widgetId = api.render(spamBox, {
          sitekey: spamBox.dataset.turnstileSitekey,
          appearance: 'interaction-only',
        });
      },
      () => (widgetId = undefined),
    );
  };
  form.addEventListener('focusin', startSpamCheck, { once: true });
  const resetSpamCheck = () => {
    if (widgetId) window.turnstile?.reset(widgetId);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));

    if (
      spamBox &&
      !(form.elements.namedItem('cf-turnstile-response') as HTMLInputElement | null)?.value
    ) {
      startSpamCheck();
      show('One moment, we are running a quick spam check. Please press Send again.', 'error');
      return;
    }

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
        // Only the server's saved receipt qualifies (honeypot replies deliberately omit it).
        if (data.conversionId) trackGoogleAdsConversion('consultation', data.conversionId);
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
      resetSpamCheck();
    }
  });
});
