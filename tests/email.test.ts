import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb } from './helpers/sqlite.ts';
import { createDb } from '../src/lib/db.ts';
import {
  emailConfig,
  emailSettings,
  requestEmailVerification,
  confirmEmail,
  queueTestEmail,
  setEmailEnabled,
  processEmailOutbox,
  reserveEmailBudget,
  sendEmail,
  type EmailEnv,
} from '../src/lib/email.ts';

const now = Math.floor(Date.now() / 1000);
const config: EmailEnv = {
  RESEND_API_KEY: 'test-secret',
  EMAIL_FROM: 'Melatec <no-reply@melatecdentalclinic.com>',
  EMAIL_ADMIN_ORIGIN: 'https://clinic.example',
  EMAIL_ENVIRONMENT: 'production',
};
const mailbox = 'admin@example.com';
function setup(enabled = true) {
  const db = testDb();
  db.raw
    .prepare('UPDATE email_settings SET active_email = ?, enabled = ?')
    .run(mailbox, enabled ? 1 : 0);
  return db;
}
async function insert(sql: ReturnType<typeof testDb>['sql'], submission = crypto.randomUUID()) {
  return createDb(sql, { actorId: null, audit: true }).from('consultation_requests').insert({
    submission_id: submission,
    full_name: 'Private Patient',
    phone: '+84 912345678',
    email: 'patient@example.com',
    service_interest: 'Private service',
    source_path: '/',
  });
}
function provider(status = 200) {
  const calls: { mail: Record<string, unknown>; key: string | null }[] = [];
  const fetcher = (async (_url, init) => {
    calls.push({
      mail: JSON.parse(String(init?.body)),
      key: new Headers(init?.headers).get('idempotency-key'),
    });
    return Response.json(
      status === 200
        ? { id: 'provider-123' }
        : { name: 'validation_error', message: 'Never persist patient@example.com' },
      { status },
    );
  }) as typeof fetch;
  return { calls, fetcher };
}
const job = (raw: ReturnType<typeof testDb>['raw']) =>
  raw.prepare('SELECT * FROM email_outbox LIMIT 1').get() as Record<string, string | number | null>;

test('email config refuses onboarding, non-HTTPS, missing mode and unrestricted staging', () => {
  assert.ok(emailConfig(config));
  for (const extra of [
    { EMAIL_ADMIN_ORIGIN: 'https://evil.example/path' },
    { EMAIL_ADMIN_ORIGIN: 'http://example.com' },
    { EMAIL_FROM: 'onboarding@resend.dev' },
    { EMAIL_FROM: 'bad\r\nfrom@example.com' },
    { EMAIL_ENVIRONMENT: '' },
    { EMAIL_ENVIRONMENT: 'staging' },
    { RESEND_API_KEY: '' },
  ])
    assert.equal(emailConfig({ ...config, ...extra }), null);
});

test('consultation and outbox are atomic; duplicate submissions and paused settings enqueue no extra jobs', async () => {
  const { raw, sql } = setup();
  const submission = crypto.randomUUID();
  assert.equal((await insert(sql, submission)).error, null);
  assert.equal((await insert(sql, submission)).error?.code, '23505');
  assert.equal(raw.prepare('SELECT count(*) n FROM email_outbox').get()?.n, 1);
  await setEmailEnabled(sql, false);
  await insert(sql);
  assert.equal(raw.prepare('SELECT count(*) n FROM email_outbox').get()?.n, 1);
  assert.doesNotMatch(
    JSON.stringify(raw.prepare('SELECT * FROM audit_logs').all()),
    /Private|patient@|admin@/,
  );
  raw.exec(
    "UPDATE email_settings SET enabled = 1; CREATE TRIGGER reject_outbox BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT, 'outbox unavailable'); END;",
  );
  assert.ok((await insert(sql)).error);
  assert.equal(raw.prepare('SELECT count(*) n FROM consultation_requests').get()?.n, 2);
});

test('verification persists only token hash, requires explicit confirmation, expires and is single use', async () => {
  const { raw, sql } = setup(false);
  const { calls, fetcher } = provider();
  assert.equal(
    await requestEmailVerification(sql, config, 'NEW@example.com', fetcher, now),
    'verification_sent',
  );
  const text = calls[0].mail.text as string;
  assert.match(text, /confirm#token=/);
  assert.doesNotMatch(text, /confirm\?token=/);
  const token = /token=([a-f0-9]{64})/.exec(text)![1];
  assert.equal((await emailSettings(sql)).active_email, mailbox);
  assert.doesNotMatch(
    JSON.stringify(raw.prepare('SELECT * FROM email_settings').get()),
    new RegExp(token),
  );
  assert.equal(await confirmEmail(sql, token, now + 3601), false);
  assert.equal(await confirmEmail(sql, token, now + 30), true);
  assert.equal(await confirmEmail(sql, token, now + 31), false);
  assert.equal((await emailSettings(sql)).active_email, 'new@example.com');
  assert.equal(await setEmailEnabled(sql, true), false);
});

test('staging never sends to another mailbox, including verification and queued alerts', async () => {
  const { sql } = setup();
  const { calls, fetcher } = provider();
  const env = { ...config, EMAIL_ENVIRONMENT: 'staging', EMAIL_STAGING_TO: 'test@example.com' };
  assert.equal(await requestEmailVerification(sql, env, mailbox, fetcher, now), 'invalid_email');
  assert.equal(await queueTestEmail(sql, env, now), 'verify_first');
  await insert(sql);
  await processEmailOutbox(sql, env, fetcher, () => now);
  assert.equal(calls.length, 0);
});

test('tests share cooldown with verification, run while paused and unlock initial enablement only on acceptance', async () => {
  const { sql, raw } = setup(false);
  const { fetcher } = provider();
  assert.equal(await setEmailEnabled(sql, true), false);
  assert.equal(await queueTestEmail(sql, config, now), 'test_queued');
  assert.equal(
    await requestEmailVerification(sql, config, 'new@example.com', fetcher, now),
    'rate_limited',
  );
  await processEmailOutbox(sql, config, fetcher, () => now);
  assert.equal(job(raw).status, 'accepted');
  assert.equal(await setEmailEnabled(sql, true), true);
});

test('sender sends minimal metadata to current recipient and records provider acceptance', async () => {
  const { sql, raw } = setup();
  const { calls, fetcher } = provider();
  await insert(sql);
  raw.prepare('UPDATE email_settings SET active_email = ?').run('new@example.com');
  await processEmailOutbox(sql, config, fetcher, () => now);
  assert.deepEqual(calls[0].mail.to, ['new@example.com']);
  assert.doesNotMatch(JSON.stringify(calls[0].mail), /Private|patient@|912345678/);
  assert.match(calls[0].mail.text as string, /https:\/\/clinic.example\/admin\/consultations\//);
  assert.equal(job(raw).status, 'accepted');
  assert.equal(job(raw).provider_id, 'provider-123');
  await processEmailOutbox(sql, config, fetcher, () => now + 60);
  assert.equal(calls.length, 1);
});

test('retry keeps payload and idempotency key identical; backoff prevents immediate resend', async () => {
  const { sql, raw } = setup();
  const { calls, fetcher } = provider(500);
  await insert(sql);
  await processEmailOutbox(sql, config, fetcher, () => now);
  assert.equal(job(raw).status, 'pending');
  await processEmailOutbox(sql, config, fetcher, () => now + 1);
  assert.equal(calls.length, 1);
  await processEmailOutbox(
    sql,
    { ...config, EMAIL_FROM: 'Changed <changed@example.com>' },
    fetcher,
    () => now + 61,
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.doesNotMatch(String(job(raw).error_code), /patient@/);
});

test('paused jobs resume, expire without backfill and attempted expired jobs become uncertain', async () => {
  const { sql, raw } = setup();
  const { calls, fetcher } = provider();
  await insert(sql);
  await setEmailEnabled(sql, false);
  await processEmailOutbox(sql, config, fetcher, () => now);
  assert.equal(calls.length, 0);
  raw.exec('UPDATE email_settings SET enabled = 1; UPDATE email_outbox SET expires_at = 0;');
  await processEmailOutbox(sql, config, fetcher, () => now);
  assert.equal(job(raw).status, 'expired');
  raw.exec("UPDATE email_outbox SET status = 'pending', attempts = 1;");
  await processEmailOutbox(sql, config, fetcher, () => now);
  assert.equal(job(raw).status, 'uncertain');
  assert.equal(calls.length, 0);
});

test('changing recipient after an ambiguous attempt requires manual review', async () => {
  const { sql, raw } = setup();
  const { calls, fetcher } = provider(503);
  await insert(sql);
  await processEmailOutbox(sql, config, fetcher, () => now);
  raw.prepare('UPDATE email_settings SET active_email = ?').run('changed@example.com');
  await processEmailOutbox(sql, config, fetcher, () => now + 61);
  assert.equal(calls.length, 1);
  assert.equal(job(raw).status, 'uncertain');
  assert.equal(job(raw).error_code, 'recipient_changed_after_attempt');
});

test('shared rolling budgets include verification and retries and defer jobs without losing requests', async () => {
  const { sql, raw } = setup();
  const env = { ...config, EMAIL_HOURLY_LIMIT: '1', EMAIL_DAILY_LIMIT: '2' };
  assert.equal(await reserveEmailBudget(sql, env, now), true);
  assert.equal(await reserveEmailBudget(sql, env, now), false);
  assert.equal(await reserveEmailBudget(sql, env, now + 3601), true);
  assert.equal(await reserveEmailBudget(sql, env, now + 7202), false);
  const { fetcher, calls } = provider();
  await insert(sql);
  await processEmailOutbox(sql, env, fetcher, () => now + 7202);
  assert.equal(calls.length, 0);
  assert.equal(job(raw).status, 'pending');
  assert.equal(raw.prepare('SELECT count(*) n FROM consultation_requests').get()?.n, 1);
});

test('sender lease excludes concurrent runs and recovers after a crashed sender', async () => {
  const { sql, raw } = setup();
  const { calls, fetcher } = provider();
  await insert(sql);
  raw
    .prepare('UPDATE email_settings SET sender_until = ?, sender_token = ?')
    .run(now + 180, 'other');
  await processEmailOutbox(sql, config, fetcher, () => now);
  assert.equal(calls.length, 0);
  raw
    .prepare("UPDATE email_outbox SET status = 'sending', attempts = 1, lease_until = ?")
    .run(now + 120);
  // A real crashed sender already froze the payload and recipient.
  raw.prepare('UPDATE email_outbox SET recipient = ?').run(mailbox);
  await processEmailOutbox(sql, config, fetcher, () => now + 181);
  assert.equal(calls.length, 1);
  assert.equal(job(raw).status, 'accepted');
});

test('provider failures distinguish permanent configuration errors, rate limits, malformed success and timeout', async () => {
  const mail = { from: config.EMAIL_FROM!, to: [mailbox], subject: 'Test', text: 'Test' };
  for (const status of [401, 403, 422]) {
    const r = await sendEmail(config, mail, 'key', provider(status).fetcher);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.retry, false);
  }
  for (const status of [429, 500, 503]) {
    const r = await sendEmail(config, mail, 'key', provider(status).fetcher);
    if (!r.ok) assert.equal(r.retry, true);
    else assert.fail();
  }
  const timeout = await sendEmail(config, mail, 'key', (async () => {
    throw new Error('private');
  }) as typeof fetch);
  assert.equal(timeout.ok, false);
  if (!timeout.ok)
    assert.deepEqual(
      [timeout.retry, timeout.ambiguous, timeout.code],
      [true, true, 'network_or_timeout'],
    );
  const malformed = await sendEmail(config, mail, 'key', (async () =>
    Response.json({})) as typeof fetch);
  if (!malformed.ok) assert.equal(malformed.ambiguous, true);
  else assert.fail();
});

test('permanent failures stop; exhausted retries remain uncertain; spam requests are skipped', async () => {
  const { sql, raw } = setup();
  await insert(sql);
  await processEmailOutbox(sql, config, provider(403).fetcher, () => now);
  assert.equal(job(raw).status, 'failed');
  raw.exec("UPDATE email_outbox SET status = 'pending', attempts = 5, next_attempt_at = 0;");
  await processEmailOutbox(sql, config, provider(503).fetcher, () => now);
  assert.equal(job(raw).status, 'uncertain');
  raw.exec(
    "UPDATE email_outbox SET status = 'pending', attempts = 0; UPDATE consultation_requests SET status = 'spam';",
  );
  const { fetcher, calls } = provider();
  await processEmailOutbox(sql, config, fetcher, () => now);
  assert.equal(calls.length, 0);
});

test('private notification data never enters the public snapshot', async () => {
  const { sql, raw } = setup();
  await insert(sql);
  raw.exec(
    "UPDATE email_settings SET pending_email = 'pending-private@example.com', token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';",
  );
  const { buildSnapshot } = await import('../src/lib/snapshot.ts');
  const snapshot = await buildSnapshot(createDb(sql, { actorId: null, audit: false }));
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /email_settings|email_outbox|pending-private|admin@example|Private Patient|aaaaaaaaaaaaaaaa/,
  );
});

test('overlapping senders claim each job only once', async () => {
  const { sql } = setup();
  await insert(sql);
  const { calls, fetcher } = provider();
  await Promise.all([
    processEmailOutbox(sql, config, fetcher, () => now),
    processEmailOutbox(sql, config, fetcher, () => now),
  ]);
  assert.equal(calls.length, 1);
});

test('provider quota and Retry-After defer retries without losing the queued notification', async () => {
  const { sql, raw } = setup();
  await insert(sql);
  const fetcher = (async () =>
    Response.json(
      { name: 'daily_quota_exceeded' },
      {
        status: 429,
        headers: { 'retry-after': '4000' },
      },
    )) as typeof fetch;
  await processEmailOutbox(sql, config, fetcher, () => now);
  const row = job(raw);
  assert.equal(row.status, 'pending');
  assert.equal(row.error_code, 'provider_quota');
  assert.equal(row.next_attempt_at, now + 4000);
});
