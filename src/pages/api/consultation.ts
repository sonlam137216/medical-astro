import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  MAX_BODY_BYTES,
  countryFromHeader,
  readBodyLimited,
  sourcePathFromReferer,
  validateConsultation,
} from '../../lib/consultation';
import { createServiceClient } from '../../lib/supabase';

// On-demand route (runs in the Worker). Handles personal data: never cache, never log field values.
export const prerender = false;

const HEADERS = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } as const;

const MESSAGES = {
  sent: 'Thank you. We have received your request.',
  invalid: 'Please check the highlighted fields.',
  rateLimited: 'Too many requests. Please wait a minute and try again.',
  unavailable: 'We could not send your request right now. Please try again in a moment.',
  rejected: 'This request was not accepted.',
} as const;

function wantsJson(request: Request) {
  return (request.headers.get('accept') ?? '').includes('application/json');
}

function reply(
  request: Request,
  status: number,
  body: { ok: boolean; message: string; errors?: Record<string, string> },
) {
  if (wantsJson(request)) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...HEADERS, 'content-type': 'application/json' },
    });
  }
  // No-JS fallback: a minimal page instead of raw JSON.
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const detail = body.errors
    ? `<ul>${Object.values(body.errors)
        .map((e) => `<li>${escape(e)}</li>`)
        .join('')}</ul>`
    : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${body.ok ? 'Request received' : 'Request not sent'}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>${escape(body.message)}</h1>${detail}<p><a href="/">Back to the website</a></p></body></html>`;
  return new Response(html, {
    status,
    headers: { ...HEADERS, 'content-type': 'text/html; charset=utf-8' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;

  // Cross-site form posts are refused. Astro's own check only covers form content types, not JSON.
  if (request.headers.get('origin') !== origin) {
    return reply(request, 403, { ok: false, message: MESSAGES.rejected });
  }

  // Per-IP limit at the Cloudflare edge (binding in wrangler.jsonc). Counted per location, so it is a
  // brake against floods, not an exact quota. The IP is used as the key only; it is never stored or logged.
  const ip = request.headers.get('cf-connecting-ip');
  if (env.CONSULTATION_LIMITER && ip) {
    const { success } = await env.CONSULTATION_LIMITER.limit({ key: ip });
    if (!success) return reply(request, 429, { ok: false, message: MESSAGES.rateLimited });
  }

  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/x-www-form-urlencoded' && type !== 'application/json') {
    return reply(request, 415, { ok: false, message: MESSAGES.rejected });
  }

  const text = await readBodyLimited(request, MAX_BODY_BYTES);
  if (text === null) return reply(request, 413, { ok: false, message: MESSAGES.rejected });

  let raw: Record<string, unknown>;
  try {
    raw =
      type === 'application/json'
        ? JSON.parse(text)
        : Object.fromEntries(new URLSearchParams(text));
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('shape');
  } catch {
    return reply(request, 400, { ok: false, message: MESSAGES.rejected });
  }

  const result = validateConsultation(raw, {
    sourcePath: sourcePathFromReferer(request.headers.get('referer'), origin),
    clientCountry: countryFromHeader(request.headers.get('cf-ipcountry')),
    newId: () => crypto.randomUUID(),
  });
  if (!result.ok) {
    return reply(request, 422, { ok: false, message: MESSAGES.invalid, errors: result.errors });
  }
  // Bots that fill the hidden field get the same answer as people, and nothing is stored.
  if (result.honeypot) return reply(request, 200, { ok: true, message: MESSAGES.sent });

  const supabase = createServiceClient(env);
  if (!supabase) {
    console.error('consultation: Supabase is not configured');
    return reply(request, 503, { ok: false, message: MESSAGES.unavailable });
  }

  const { value } = result;
  const { error } = await supabase.from('consultation_requests').insert({
    submission_id: value.submissionId,
    full_name: value.fullName,
    phone: value.phone,
    email: value.email,
    service_interest: value.serviceInterest,
    source_path: value.sourcePath,
    client_country: value.clientCountry,
  });

  // 23505 = unique violation on submission_id: the same form was already saved (double click, retry).
  if (error && error.code !== '23505') {
    // Code only. The message can echo field values, which are personal data.
    console.error('consultation: insert failed', error.code);
    return reply(request, 503, { ok: false, message: MESSAGES.unavailable });
  }

  // Only reached once the row is stored (or was already stored).
  return reply(request, 200, { ok: true, message: MESSAGES.sent });
};
