import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSameOrigin } from '../../../lib/admin-auth';
import { readBodyLimited } from '../../../lib/consultation';
import {
  emailConfig,
  queueTestEmail,
  requestEmailVerification,
  setEmailEnabled,
} from '../../../lib/email';

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const body = await readBodyLimited(request, 2048);
  if (body === null) return new Response('Payload Too Large', { status: 413 });
  const form = new URLSearchParams(body);
  let result: string = 'invalid_action';
  try {
    switch (form.get('action')) {
      case 'verify':
        result = await requestEmailVerification(env.DB, env, form.get('email') ?? '');
        break;
      case 'test':
        result = await queueTestEmail(env.DB, env);
        break;
      case 'enable':
        result =
          emailConfig(env) && (await setEmailEnabled(env.DB, true)) ? 'enabled' : 'test_first';
        break;
      case 'disable':
        await setEmailEnabled(env.DB, false);
        result = 'disabled';
        break;
    }
  } catch {
    console.error('email: admin action failed');
    result = 'unavailable';
  }
  return new Response(null, {
    status: 303,
    headers: { location: `/admin/email?result=${result}` },
  });
};
