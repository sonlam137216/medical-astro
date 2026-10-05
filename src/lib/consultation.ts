// Server-side validation for the consultation form. Pure functions (no Worker APIs) so they can be
// unit-tested. Limits mirror the CHECK constraints on `public.consultation_requests`.

export const MAX_BODY_BYTES = 8 * 1024;

export const FIELD_LIMITS = {
  name: { min: 1, max: 120 },
  phone: { min: 5, max: 40 },
  email: { max: 254 },
  service: { max: 120 },
} as const;

export interface ConsultationInput {
  submissionId: string;
  fullName: string;
  phone: string;
  email: string;
  serviceInterest: string | null;
  sourcePath: string | null;
  clientCountry: string | null;
}

export type FieldName = 'name' | 'phone' | 'email' | 'service';
export type FieldErrors = Partial<Record<FieldName, string>>;

export type ValidationResult =
  { ok: true; value: ConsultationInput; honeypot: boolean } | { ok: false; errors: FieldErrors };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Same shape as the database CHECK on `email`.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+?[0-9 ()\-.]+$/;
// Same shape as the `url_path` domain.
const URL_PATH_RE = /^\/([a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*)?$/;

/** Trim, drop control characters and collapse inner whitespace. Not HTML escaping: output is escaped where rendered. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
export function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

/** Page the form was submitted from, taken from the Referer path only (never query string or host). */
export function sourcePathFromReferer(referer: string | null, origin: string): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.origin !== origin) return null;
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname;
    return URL_PATH_RE.test(path) && path.length <= 200 ? path : null;
  } catch {
    return null;
  }
}

/** `CF-IPCountry` is a two-letter code; Cloudflare uses XX (unknown) and T1 (Tor) as placeholders. */
export function countryFromHeader(value: string | null): string | null {
  if (!value || !/^[A-Z]{2}$/.test(value) || value === 'XX' || value === 'T1') return null;
  return value;
}

export function validateConsultation(
  raw: Record<string, unknown>,
  context: { sourcePath: string | null; clientCountry: string | null; newId: () => string },
): ValidationResult {
  const errors: FieldErrors = {};

  const fullName = clean(raw.name);
  if (fullName.length < FIELD_LIMITS.name.min) errors.name = 'Please enter your name.';
  else if (fullName.length > FIELD_LIMITS.name.max) errors.name = 'Name is too long.';

  const phone = clean(raw.phone);
  const phoneDigits = phone.replace(/\D/g, '').length;
  if (!phone) errors.phone = 'Please enter your phone number.';
  else if (
    !PHONE_RE.test(phone) ||
    phoneDigits < FIELD_LIMITS.phone.min ||
    phone.length > FIELD_LIMITS.phone.max
  )
    errors.phone = 'Please enter a valid phone number, including the country code.';

  const email = clean(raw.email);
  if (!email) errors.email = 'Please enter your email.';
  else if (!EMAIL_RE.test(email) || email.length > FIELD_LIMITS.email.max)
    errors.email = 'Please enter a valid email address.';

  const service = clean(raw.service);
  if (service.length > FIELD_LIMITS.service.max)
    errors.service = 'Please choose a treatment from the list.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // The submission id is a double-submit guard, not a secret. Without JS the form has none: mint one.
  const given = typeof raw.submission_id === 'string' ? raw.submission_id.trim() : '';
  const submissionId = UUID_RE.test(given) ? given.toLowerCase() : context.newId();

  return {
    ok: true,
    // A filled honeypot means a bot. Callers answer as if it worked and store nothing.
    honeypot: clean(raw.website) !== '',
    value: {
      submissionId,
      fullName,
      phone,
      email,
      serviceInterest: service || null,
      sourcePath: context.sourcePath,
      clientCountry: context.clientCountry,
    },
  };
}

/** Read a request body but stop (and report) once it exceeds `max` bytes, even without Content-Length. */
export async function readBodyLimited(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    // Stop reading and drop the rest; the runtime discards an unread body.
    if (received > max) return null;
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
