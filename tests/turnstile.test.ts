import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITEVERIFY_URL, verifyTurnstile } from '../src/lib/turnstile.ts';

const answer = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

test('a token Cloudflare accepts passes', async () => {
  let sent: URLSearchParams | undefined;
  const fake = (async (url: string, init: RequestInit) => {
    assert.equal(url, SITEVERIFY_URL);
    sent = init.body as URLSearchParams;
    return new Response(JSON.stringify({ success: true }));
  }) as unknown as typeof fetch;
  assert.equal(await verifyTurnstile('tok', 'secret', '203.0.113.9', fake), 'passed');
  assert.equal(sent?.get('secret'), 'secret');
  assert.equal(sent?.get('response'), 'tok');
  assert.equal(sent?.get('remoteip'), '203.0.113.9');
});

test('a rejected, missing or oversized token fails without asking Cloudflare when it is obviously bad', async () => {
  assert.equal(await verifyTurnstile('tok', 's', null, answer({ success: false })), 'failed');
  const never = (async () => assert.fail('must not be called')) as unknown as typeof fetch;
  assert.equal(await verifyTurnstile(undefined, 's', null, never), 'failed');
  assert.equal(await verifyTurnstile('', 's', null, never), 'failed');
  assert.equal(await verifyTurnstile('x'.repeat(2049), 's', null, never), 'failed');
});

test('a Cloudflare outage is not blamed on the visitor', async () => {
  assert.equal(await verifyTurnstile('tok', 's', null, answer({}, 500)), 'unavailable');
  const down = (async () => {
    throw new Error('network');
  }) as unknown as typeof fetch;
  assert.equal(await verifyTurnstile('tok', 's', null, down), 'unavailable');
});
