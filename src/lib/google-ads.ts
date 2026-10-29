// Only account IDs and labels are accepted; administrators never paste executable code.
export const GOOGLE_ADS_ID_RE = /^AW-[0-9]{1,20}$/;
export const GOOGLE_ADS_LABEL_RE = /^[A-Za-z0-9_-]{1,100}$/;
export const GOOGLE_ADS_ACTIONS = [
  { key: 'consultation', column: 'google_ads_consultation_label', name: 'Consultation received' },
  { key: 'phone', column: 'google_ads_phone_label', name: 'Phone click' },
  { key: 'zalo', column: 'google_ads_zalo_label', name: 'Zalo click' },
  { key: 'whatsapp', column: 'google_ads_whatsapp_label', name: 'WhatsApp click' },
] as const;
export type GoogleAdsAction = (typeof GOOGLE_ADS_ACTIONS)[number]['key'];
export interface GoogleAdsConfig {
  id: string;
  labels: Partial<Record<GoogleAdsAction, string>>;
}

export function normalizeGoogleAdsFields(row: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  const id = String(row.google_ads_id ?? '').trim();
  const values: Record<string, string | null> = { google_ads_id: id || null };
  if (id && !GOOGLE_ADS_ID_RE.test(id))
    errors.google_ads_id =
      'Enter the Google Ads conversion ID, for example AW-123456789. Do not paste a script.';
  for (const action of GOOGLE_ADS_ACTIONS) {
    const label = String(row[action.column] ?? '').trim();
    values[action.column] = label || null;
    if (label && !GOOGLE_ADS_LABEL_RE.test(label))
      errors[action.column] =
        'Enter only the Conversion Label from Google Ads (letters, numbers, - or _).';
  }
  if (Object.keys(errors).length === 0) Object.assign(row, values);
  return errors;
}

export function googleAdsFromRow(row: Record<string, unknown>): GoogleAdsConfig | undefined {
  if (typeof row.google_ads_id !== 'string' || !GOOGLE_ADS_ID_RE.test(row.google_ads_id)) return;
  const labels: GoogleAdsConfig['labels'] = {};
  for (const action of GOOGLE_ADS_ACTIONS) {
    const label = row[action.column];
    if (typeof label === 'string' && GOOGLE_ADS_LABEL_RE.test(label)) labels[action.key] = label;
  }
  return { id: row.google_ads_id, labels };
}

export function isGoogleAdsConfig(value: unknown): value is GoogleAdsConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !GOOGLE_ADS_ID_RE.test(v.id)) return false;
  if (!v.labels || typeof v.labels !== 'object' || Array.isArray(v.labels)) return false;
  return Object.entries(v.labels).every(
    ([key, label]) =>
      GOOGLE_ADS_ACTIONS.some((a) => a.key === key) &&
      typeof label === 'string' &&
      GOOGLE_ADS_LABEL_RE.test(label),
  );
}

/** Known contact links only; never include a phone number or destination URL in event data. */
export function googleAdsContactAction(href: string): GoogleAdsAction | undefined {
  try {
    const url = new URL(href);
    if (url.protocol === 'tel:') return 'phone';
    if (url.protocol !== 'https:') return;
    if (['zalo.me', 'www.zalo.me', 'chat.zalo.me'].includes(url.hostname)) return 'zalo';
    if (
      [
        'wa.me',
        'api.whatsapp.com',
        'web.whatsapp.com',
        'www.whatsapp.com',
        'whatsapp.com',
      ].includes(url.hostname)
    )
      return 'whatsapp';
  } catch {
    /* Relative links and non-contact URLs are not conversions. */
  }
}

/** Keep click attribution, but drop arbitrary query strings and fragments from the measurement URL. */
export function googleAdsPageLocation(href: string): string {
  const url = new URL(href);
  const clean = new URL(url.pathname, url.origin);
  for (const key of ['gclid', 'gbraid', 'wbraid']) {
    const value = url.searchParams.get(key);
    if (value && /^[A-Za-z0-9_.~-]{1,500}$/.test(value)) clean.searchParams.set(key, value);
  }
  return clean.href;
}
