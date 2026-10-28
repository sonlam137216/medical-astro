import type { SqlDatabase } from './db.ts';
import { sha256Hex } from './admin-auth.ts';

/** Runtime-only settings. These must never be read by public content/snapshot code. */
export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_ADMIN_ORIGIN?: string;
  EMAIL_ENVIRONMENT?: string;
  EMAIL_STAGING_TO?: string;
  EMAIL_HOURLY_LIMIT?: string;
  EMAIL_DAILY_LIMIT?: string;
}
export interface EmailSettings {
  enabled: number;
  active_email: string | null;
  pending_email: string | null;
  token_expires_at: number | null;
  last_test_email: string | null;
  last_test_at: string | null;
  confirmation_status: string | null;
}
export interface EmailJob {
  id: string;
  kind: 'consultation' | 'test';
  consultation_id: string | null;
  created_at: string;
  expires_at: number;
  status: string;
  attempts: number;
  recipient: string | null;
  payload: string | null;
  first_attempt_at: number | null;
  provider_id: string | null;
  error_code: string | null;
  accepted_at: string | null;
}
interface Mail {
  from: string;
  to: string[];
  subject: string;
  text: string;
}
type SendResult =
  | { ok: true; id: string }
  | { ok: false; code: string; retry: boolean; ambiguous: boolean; delay: number };
const SECOND = 1000;
const TTL = 20 * 60 * 60; // Shorter than Resend's 24-hour idempotency retention.
const MAX_ATTEMPTS = 6;
export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const seconds = () => Math.floor(Date.now() / SECOND);

async function rows<T>(db: SqlDatabase, query: string, ...params: unknown[]): Promise<T[]> {
  const result = await db
    .prepare(query)
    .bind(...params)
    .all();
  return (result.results ?? []) as T[];
}
async function run(db: SqlDatabase, query: string, ...params: unknown[]) {
  await rows(db, query, ...params);
}
export async function emailSettings(db: SqlDatabase): Promise<EmailSettings> {
  return (await rows<EmailSettings>(db, 'SELECT * FROM email_settings WHERE id = 1'))[0];
}
export async function recentEmails(db: SqlDatabase): Promise<EmailJob[]> {
  return rows(db, 'SELECT * FROM email_outbox ORDER BY created_at DESC, id DESC LIMIT 25');
}

export function emailConfig(env: EmailEnv) {
  const from = (env.EMAIL_FROM ?? '').trim();
  const address = /^(?:[^<>\r\n]+ <([^<>]+)>|([^<>\r\n]+))$/.exec(from);
  if (
    !env.RESEND_API_KEY ||
    /[\r\n]/.test(from) ||
    !address ||
    !EMAIL_RE.test(address[1] ?? address[2])
  )
    return null;
  // No onboarding mode: a verified sending domain is required.
  if ((address[1] ?? address[2]).toLowerCase().endsWith('@resend.dev')) return null;
  try {
    const url = new URL(env.EMAIL_ADMIN_ORIGIN ?? '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    if (!['production', 'staging'].includes(env.EMAIL_ENVIRONMENT ?? '')) return null;
    if (env.EMAIL_ENVIRONMENT === 'staging' && !validEmail(env.EMAIL_STAGING_TO ?? '')) return null;
    return { from, origin: url.origin };
  } catch {
    return null;
  }
}
function validEmail(email: string) {
  return email.length <= 254 && EMAIL_RE.test(email);
}
function allowedRecipient(env: EmailEnv, email: string) {
  return (
    validEmail(email) &&
    (env.EMAIL_ENVIRONMENT === 'production' ||
      (env.EMAIL_ENVIRONMENT === 'staging' && email === env.EMAIL_STAGING_TO?.trim().toLowerCase()))
  );
}
function limit(value: string | undefined, fallback: number) {
  return value && /^\d+$/.test(value) ? Math.max(0, Math.min(Number(value), 10000)) : fallback;
}
/** One conditional INSERT is an atomic quota reservation, even across Worker instances. */
export async function reserveEmailBudget(db: SqlDatabase, env: EmailEnv, now = seconds()) {
  const reserved = await rows(
    db,
    `INSERT INTO email_send_attempts (id, attempted_at) SELECT ?, ?
     WHERE (SELECT count(*) FROM email_send_attempts WHERE attempted_at > ?) < ?
       AND (SELECT count(*) FROM email_send_attempts WHERE attempted_at > ?) < ? RETURNING id`,
    crypto.randomUUID(),
    now,
    now - 3600,
    limit(env.EMAIL_HOURLY_LIMIT, 20),
    now - 86400,
    limit(env.EMAIL_DAILY_LIMIT, 90),
  );
  return reserved.length > 0;
}

/** Never persist or log provider error messages: they can contain addresses and other submitted data. */
export async function sendEmail(
  env: EmailEnv,
  mail: Mail,
  key: string,
  fetcher = fetch,
): Promise<SendResult> {
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify(mail),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const body = (await response.json()) as { id?: unknown };
      if (typeof body.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(body.id))
        return { ok: true, id: body.id };
      return { ok: false, code: 'invalid_response', retry: true, ambiguous: true, delay: 60 };
    }
    // Explicit allowlist: never store an arbitrary provider-supplied string.
    const data = (await response.json().catch(() => ({}))) as { name?: string };
    const quota = ['daily_quota_exceeded', 'monthly_quota_exceeded'].includes(data.name ?? '');
    const conflict = response.status === 409 && data.name !== 'concurrent_idempotent_requests';
    const retry =
      response.status === 429 || response.status >= 500 || (response.status === 409 && !conflict);
    const header = Number(response.headers.get('retry-after'));
    return {
      ok: false,
      code: quota ? 'provider_quota' : `http_${response.status}`,
      retry,
      ambiguous: response.status >= 500 || conflict,
      delay: Math.min(TTL, Math.max(quota ? 3600 : 60, Number.isFinite(header) ? header : 0)),
    };
  } catch {
    return { ok: false, code: 'network_or_timeout', retry: true, ambiguous: true, delay: 60 };
  }
}

/** A shared database cooldown protects tests and verification, independent of IP/edge location. */
async function takeAction(db: SqlDatabase, now: number) {
  return (
    (
      await rows(
        db,
        'UPDATE email_settings SET action_after = ? WHERE id = 1 AND action_after <= ? RETURNING id',
        now + 60,
        now,
      )
    ).length > 0
  );
}
export async function requestEmailVerification(
  db: SqlDatabase,
  env: EmailEnv,
  input: string,
  fetcher = fetch,
  now = seconds(),
) {
  const email = input.trim().toLowerCase();
  const config = emailConfig(env);
  if (!config) return 'configuration';
  if (!allowedRecipient(env, email)) return 'invalid_email';
  if (!(await takeAction(db, now))) return 'rate_limited';
  if (!(await reserveEmailBudget(db, env, now))) return 'budget';
  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  await run(
    db,
    `UPDATE email_settings SET pending_email = ?, token_hash = ?, token_expires_at = ?, confirmation_status = 'sending' WHERE id = 1`,
    email,
    await sha256Hex(token),
    now + 3600,
  );
  const result = await sendEmail(
    env,
    {
      from: config.from,
      to: [email],
      subject: 'Confirm Melatec email notifications',
      text: `An administrator requested this address for consultation notifications. Sign in to the Melatec admin, then open this link and press Confirm. The link expires in one hour.\n\n${config.origin}/admin/email/confirm#token=${token}\n\nIf you did not expect this request, ignore this email.`,
    },
    `verification/${crypto.randomUUID()}`,
    fetcher,
  );
  await run(
    db,
    'UPDATE email_settings SET confirmation_status = ? WHERE id = 1 AND token_hash = ?',
    result.ok ? 'accepted' : result.code,
    await sha256Hex(token),
  );
  return result.ok ? 'verification_sent' : 'verification_failed';
}
export async function confirmEmail(db: SqlDatabase, token: string, now = seconds()) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  return (
    (
      await rows(
        db,
        `UPDATE email_settings SET active_email = pending_email, pending_email = NULL,
    token_hash = NULL, token_expires_at = NULL, last_test_email = NULL, last_test_at = NULL,
    confirmation_status = NULL WHERE id = 1 AND token_hash = ? AND token_expires_at > ? AND pending_email IS NOT NULL RETURNING id`,
        await sha256Hex(token),
        now,
      )
    ).length > 0
  );
}
export async function setEmailEnabled(db: SqlDatabase, enabled: boolean) {
  if (!enabled) {
    await run(db, 'UPDATE email_settings SET enabled = 0 WHERE id = 1');
    return true;
  }
  return (
    (
      await rows(
        db,
        `UPDATE email_settings SET enabled = 1 WHERE id = 1
    AND active_email IS NOT NULL AND last_test_email = active_email AND last_test_at IS NOT NULL RETURNING id`,
      )
    ).length > 0
  );
}
export async function queueTestEmail(db: SqlDatabase, env: EmailEnv, now = seconds()) {
  if (!emailConfig(env)) return 'configuration';
  const settings = await emailSettings(db);
  if (!settings.active_email || !allowedRecipient(env, settings.active_email))
    return 'verify_first';
  if (!(await takeAction(db, now))) return 'rate_limited';
  await run(
    db,
    `INSERT INTO email_outbox (id, kind, expires_at) VALUES (?, 'test', ?)`,
    `test/${crypto.randomUUID()}`,
    now + TTL,
  );
  return 'test_queued';
}

function message(
  job: EmailJob,
  config: NonNullable<ReturnType<typeof emailConfig>>,
  recipient: string,
  receivedAt: string,
): Mail {
  const text =
    job.kind === 'test'
      ? `This is a test of Melatec consultation notifications.\n\n${config.origin}/admin/consultations`
      : `A new consultation request is available.\nRequest: ${job.consultation_id}\nReceived: ${receivedAt} (UTC)\n\n${config.origin}/admin/consultations/${job.consultation_id}\n\nSign in to view the request details.`;
  // Plain text avoids HTML injection and tracking pixels. Tracking must also be disabled for the Resend domain.
  return {
    from: config.from,
    to: [recipient],
    subject: job.kind === 'test' ? 'Melatec notification test' : 'New Melatec consultation request',
    text,
  };
}

/** Cron only. A run holds a database lease, processes at most five jobs and never throws raw errors to logs. */
export async function processEmailOutbox(
  db: SqlDatabase,
  env: EmailEnv,
  fetcher = fetch,
  clock = seconds,
) {
  const config = emailConfig(env);
  if (!config) return;
  const lock = crypto.randomUUID();
  const now = clock();
  if (
    !(
      await rows(
        db,
        `UPDATE email_settings SET sender_token = ?, sender_until = ? WHERE id = 1 AND sender_until <= ? RETURNING id`,
        lock,
        now + 180,
        now,
      )
    ).length
  )
    return;
  try {
    await run(
      db,
      `UPDATE email_outbox SET status = CASE WHEN attempts > 0 THEN 'uncertain' ELSE 'expired' END,
      error_code = 'expired' WHERE status IN ('pending', 'sending') AND expires_at <= ?`,
      now,
    );
    await run(db, 'DELETE FROM email_send_attempts WHERE attempted_at <= ?', now - 86400 * 31);
    await run(
      db,
      `UPDATE email_settings SET pending_email = NULL, token_hash = NULL, token_expires_at = NULL
      WHERE token_expires_at <= ?`,
      now,
    );
    for (let i = 0; i < 5; i++) {
      const at = clock();
      const settings = await emailSettings(db);
      if (!settings.active_email || !allowedRecipient(env, settings.active_email)) break;
      const jobs = await rows<EmailJob>(
        db,
        `SELECT * FROM email_outbox WHERE expires_at > ? AND next_attempt_at <= ?
        AND (status = 'pending' OR (status = 'sending' AND lease_until <= ?))
        AND (kind = 'test' OR ? = 1) ORDER BY created_at, id LIMIT 1`,
        at,
        at,
        at,
        settings.enabled,
      );
      const job = jobs[0];
      if (!job) break;
      // A retry must reuse the exact payload. A recipient change after an attempt needs manual review.
      if (
        job.attempts > 0 &&
        (job.recipient !== settings.active_email || job.attempts >= MAX_ATTEMPTS)
      ) {
        await run(
          db,
          `UPDATE email_outbox SET status = 'uncertain', error_code = ? WHERE id = ?`,
          job.recipient !== settings.active_email
            ? 'recipient_changed_after_attempt'
            : 'retry_exhausted',
          job.id,
        );
        continue;
      }
      let receivedAt = job.created_at;
      if (job.consultation_id) {
        const request = (
          await rows<{ created_at: string; status: string }>(
            db,
            'SELECT created_at, status FROM consultation_requests WHERE id = ?',
            job.consultation_id,
          )
        )[0];
        if (!request || request.status === 'spam') {
          await run(
            db,
            `UPDATE email_outbox SET status = 'expired', error_code = 'request_removed_or_spam' WHERE id = ?`,
            job.id,
          );
          continue;
        }
        receivedAt = request.created_at;
      }
      const payload =
        job.payload ?? JSON.stringify(message(job, config, settings.active_email, receivedAt));
      if (!(await reserveEmailBudget(db, env, at))) break;
      // Re-check settings atomically at claim time. The lease is longer than the bounded API timeout.
      const claimed = await rows(
        db,
        `UPDATE email_outbox SET status = 'sending', lease_until = ?, attempts = attempts + 1,
        first_attempt_at = coalesce(first_attempt_at, ?), payload = ?, recipient = ? WHERE id = ?
        AND EXISTS (SELECT 1 FROM email_settings WHERE id = 1 AND sender_token = ? AND sender_until > ?
          AND active_email = ? AND (enabled = 1 OR ? = 'test')) RETURNING id`,
        at + 120,
        at,
        payload,
        settings.active_email,
        job.id,
        lock,
        at,
        settings.active_email,
        job.kind,
      );
      if (!claimed.length) break;
      const result = await sendEmail(env, JSON.parse(payload) as Mail, job.id, fetcher);
      const finishedAt = clock();
      if (result.ok) {
        const statements = [
          db
            .prepare(
              `UPDATE email_outbox SET status = 'accepted', provider_id = ?, accepted_at = ?, error_code = NULL WHERE id = ?`,
            )
            .bind(result.id, new Date(finishedAt * SECOND).toISOString(), job.id),
        ];
        if (job.kind === 'test')
          statements.push(
            db
              .prepare(
                'UPDATE email_settings SET last_test_email = ?, last_test_at = ? WHERE id = 1 AND active_email = ?',
              )
              .bind(
                settings.active_email,
                new Date(finishedAt * SECOND).toISOString(),
                settings.active_email,
              ),
          );
        await db.batch(statements);
      } else {
        const exhausted = job.attempts + 1 >= MAX_ATTEMPTS;
        // Any earlier timeout may have been accepted. Never label a later terminal error as definitely unsent.
        const status =
          result.retry && !exhausted
            ? 'pending'
            : result.ambiguous || job.attempts > 0
              ? 'uncertain'
              : 'failed';
        await run(
          db,
          `UPDATE email_outbox SET status = ?, error_code = ?, next_attempt_at = ? WHERE id = ?`,
          status,
          result.code,
          finishedAt + Math.max(result.delay, 60 * 2 ** job.attempts),
          job.id,
        );
        if (result.code === 'provider_quota' || result.code === 'http_429') break;
      }
    }
  } finally {
    await run(
      db,
      'UPDATE email_settings SET sender_until = 0, sender_token = NULL WHERE id = 1 AND sender_token = ?',
      lock,
    );
  }
}
