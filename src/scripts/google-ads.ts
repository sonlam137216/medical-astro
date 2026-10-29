import {
  googleAdsContactAction,
  googleAdsPageLocation,
  isGoogleAdsConfig,
  type GoogleAdsAction,
  type GoogleAdsConfig,
} from '../lib/google-ads';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const CONSENT_KEY = 'melatec-google-ads-consent-v1';
let config: GoogleAdsConfig | undefined;
let granted = false;
let started = false;
const sent = new Set<string>();

function command(...args: unknown[]) {
  // Google’s queue uses the function's arguments object, rather than an array.
  window.gtag?.(...args);
}

function start() {
  if (started || !config) return;
  started = true;
  window.dataLayer ??= [];
  window.gtag ??= function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  command('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  command('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted' });
  command('set', 'ads_data_redaction', true);
  command('set', 'allow_ad_personalization_signals', false);
  // Do not send arbitrary URL parameters, form values or referrer query strings.
  command('set', {
    page_location: googleAdsPageLocation(location.href),
    page_referrer: document.referrer ? new URL(document.referrer).origin : '',
    page_title: 'Melatec Dental Clinic',
  });
  command('js', new Date());
  command('config', config.id, { allow_enhanced_conversions: false });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.id)}`;
  document.head.appendChild(script);
}

/** Receipts are opaque UUIDs, also used by Google to deduplicate a saved form retried after a lost response. */
export function trackGoogleAdsConversion(
  action: GoogleAdsAction,
  receipt?: string,
  onSent?: () => void,
): boolean {
  const label = config?.labels[action];
  if (!granted || !started || !label || !config) return false;
  if (action === 'consultation' && (!receipt || !/^[0-9a-f-]{36}$/i.test(receipt))) return false;
  const key = receipt ? `${action}:${receipt}` : undefined;
  if (key && sent.has(key)) return false;
  try {
    command('event', 'conversion', {
      send_to: `${config.id}/${label}`,
      ...(receipt ? { transaction_id: receipt } : {}),
      transport_type: 'beacon',
      ...(onSent ? { event_callback: onSent, event_timeout: 800 } : {}),
    });
    if (key) sent.add(key);
    return true;
  } catch {
    // A blocked or unavailable tag must never interrupt a consultation or contact link.
    return false;
  }
}

export function initGoogleAds(): void {
  const root = document.querySelector<HTMLElement>('[data-google-ads]');
  if (!root || root.dataset.origin !== location.origin) return;
  try {
    const parsed: unknown = JSON.parse(root.dataset.config ?? '');
    if (!isGoogleAdsConfig(parsed)) return;
    config = parsed;
  } catch {
    return;
  }
  const panel = root.querySelector<HTMLElement>('[data-ads-consent]');
  const settings = root.querySelector<HTMLButtonElement>('[data-ads-settings]');
  const status = root.querySelector<HTMLElement>('[data-ads-status]');
  if (!panel || !settings) return;
  let choice: string | null = null;
  try {
    choice = localStorage.getItem(CONSENT_KEY);
  } catch {
    /* Ask again when storage is unavailable. */
  }

  const showPanel = (open: boolean) => {
    panel.hidden = !open;
    settings.setAttribute('aria-expanded', String(open));
  };
  const choose = (accept: boolean) => {
    granted = accept;
    try {
      localStorage.setItem(CONSENT_KEY, accept ? 'granted' : 'denied');
    } catch {
      /* Page-only choice. */
    }
    if (accept) {
      if (started) command('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted' });
      else start();
    } else if (started) {
      command('consent', 'update', { ad_storage: 'denied', ad_user_data: 'denied' });
      // Reset the loaded tag after the denial update; subsequent pages will not load it.
      location.reload();
    }
    showPanel(false);
    if (status)
      status.textContent = accept
        ? 'Google Ads measurement accepted.'
        : 'Google Ads measurement declined.';
    settings.focus({ preventScroll: true });
  };
  granted = choice === 'granted';
  if (granted) start();
  showPanel(choice !== 'granted' && choice !== 'denied');
  root.querySelector('[data-ads-accept]')?.addEventListener('click', () => choose(true));
  root.querySelector('[data-ads-decline]')?.addEventListener('click', () => choose(false));
  settings.addEventListener('click', () => {
    showPanel(Boolean(panel.hidden));
    if (!panel.hidden) panel.querySelector<HTMLButtonElement>('button')?.focus();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === CONSENT_KEY && event.newValue !== (granted ? 'granted' : 'denied'))
      location.reload();
  });
  // All contact links, including header/footer, cards and the floating dock.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href]');
    const action = link && googleAdsContactAction(link.href);
    if (!action || !link) return;
    // Same-tab links can unload before the beacon is sent. Wait at most 800 ms,
    // then continue even if an ad blocker prevents Google's callback. Other clicks retain native behavior.
    const sameTab =
      (!link.target || link.target === '_self') &&
      !link.hasAttribute('download') &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey;
    if (!sameTab) {
      trackGoogleAdsConversion(action);
      return;
    }
    let navigated = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const navigate = () => {
      if (navigated) return;
      navigated = true;
      clearTimeout(timer);
      location.assign(link.href);
    };
    if (trackGoogleAdsConversion(action, undefined, navigate)) {
      event.preventDefault();
      timer = setTimeout(navigate, 800);
    }
  });
}
