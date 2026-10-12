// Cloudflare Turnstile: the spam check for the consultation forms. Optional: it is on only when the secret key
// is set (TURNSTILE_SECRET_KEY on the Worker) and the build has the site key (TURNSTILE_SITE_KEY), so the
// forms work the same way without it until spam shows up. Pure function with an injectable `fetch` for tests.

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** The form field Turnstile's widget adds to the form. */
export const TURNSTILE_FIELD = 'cf-turnstile-response';

export type TurnstileResult =
  /** Cloudflare accepted the token. */
  | 'passed'
  /** Missing, expired, reused or wrong token: treat the visitor as a bot. */
  | 'failed'
  /** Cloudflare could not be reached or answered nonsense: not the visitor's fault, ask them to retry. */
  | 'unavailable';

export async function verifyTurnstile(
  token: unknown,
  secret: string,
  ip: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
  // Tokens are at most 2048 characters; anything else is not worth a request.
  if (typeof token !== 'string' || token === '' || token.length > 2048) return 'failed';
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return 'unavailable';
    const data = (await response.json()) as { success?: unknown };
    return data.success === true ? 'passed' : 'failed';
  } catch {
    return 'unavailable';
  }
}
