import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureMessage, plan, run, staleCutoff } from '../scripts/publish-job.mjs';
import { d1Query } from '../src/lib/d1-http.ts';
import { d1HttpMock } from './helpers/d1-http-mock.ts';
import { testDb } from './helpers/sqlite.ts';

const J = '11111111-2222-3333-4444-555555555555';
const now = new Date('2026-10-05T10:00:00.000Z');
const ENV = {
  CLOUDFLARE_ACCOUNT_ID: 'acct',
  CLOUDFLARE_API_TOKEN: 'secret-token-123',
  D1_DATABASE_ID: 'db1',
  JOB_ID: J,
};

function jobs() {
  const { raw } = testDb();
  const rev = (
    raw
      .prepare(
        "INSERT INTO content_revisions (snapshot, content_hash) VALUES ('{}', ?) RETURNING id",
      )
      .get('a'.repeat(64)) as { id: string }
  ).id;
  const add = (id: string, status: string, started?: string) =>
    raw
      .prepare('INSERT INTO publish_jobs (id, revision_id, status, started_at) VALUES (?, ?, ?, ?)')
      .run(id, rev, status, started ?? null);
  const status = (id: string) =>
    raw.prepare('SELECT status, deploy_ref, error FROM publish_jobs WHERE id = ?').get(id) as {
      status: string;
      deploy_ref: string | null;
      error: string | null;
    };
  return { raw, add, status };
}

test('stale cutoff is 60 minutes earlier', () =>
  assert.equal(staleCutoff(now), '2026-10-05T09:00:00.000Z'));

test('messages are bounded and never empty', () => {
  assert.equal(failureMessage('x'.repeat(900)).length, 500);
  assert.equal(failureMessage('  multi\n line   msg '), 'multi line msg');
  assert.notEqual(failureMessage(''), '');
  assert.notEqual(failureMessage(undefined), '');
});

test('bad input is rejected before anything is sent', () => {
  assert.throws(() => plan('finish', { jobId: "x'; drop" }));
  assert.throws(() => plan('start', { jobId: J, runId: '12a' }));
  assert.throws(() => plan('nope', { jobId: J }));
});

test('start claims a queued job, recording the run', async () => {
  const { raw, add, status } = jobs();
  add(J, 'queued');
  const { fetchImpl } = d1HttpMock(raw);
  const result = await run('start', { ...ENV, RUN_ID: '123' }, fetchImpl);
  assert.equal(result.claim.length, 1);
  assert.deepEqual({ ...status(J) }, { status: 'building', deploy_ref: '123', error: null });
});

test('start skips a job that was superseded or already taken', async () => {
  const { raw, add, status } = jobs();
  add(J, 'superseded');
  const { fetchImpl } = d1HttpMock(raw);
  const result = await run('start', { ...ENV, RUN_ID: '123' }, fetchImpl);
  assert.equal(result.claim.length, 0);
  assert.equal(status(J).status, 'superseded');
});

test('start fails a build stuck for over an hour so it cannot block new ones, then claims', async () => {
  const { raw, add, status } = jobs();
  const stuck = '99999999-2222-3333-4444-555555555555';
  add(stuck, 'building', new Date(Date.now() - 2 * 3600_000).toISOString());
  add(J, 'queued');
  const { fetchImpl } = d1HttpMock(raw);
  const result = await run('start', { ...ENV, RUN_ID: '9' }, fetchImpl);
  assert.equal(result.reap.length, 1);
  assert.equal(result.claim.length, 1);
  assert.equal(status(stuck).status, 'failed');
  assert.match(status(stuck).error!, /did not finish in time/);
  assert.equal(status(J).status, 'building');
});

test('a recent build is left alone (and so the queued job cannot start: one build at a time)', async () => {
  const { raw, add, status } = jobs();
  const running = '99999999-2222-3333-4444-555555555555';
  add(running, 'building', new Date(Date.now() - 5 * 60_000).toISOString());
  add(J, 'queued');
  const { fetchImpl } = d1HttpMock(raw);
  const result = await run('start', { ...ENV, RUN_ID: '9' }, fetchImpl).catch((e) => e);
  assert.ok(result instanceof Error, 'the database refuses a second building job');
  assert.equal(status(running).status, 'building');
  assert.equal(status(J).status, 'queued');
});

test('finish only moves a building job to deployed; fail covers queued and building', async () => {
  const { raw, add, status } = jobs();
  add(J, 'queued');
  const { fetchImpl } = d1HttpMock(raw);
  assert.equal(
    (await run('finish', ENV, fetchImpl)).finish.length,
    0,
    'not building: nothing changes',
  );
  assert.equal(status(J).status, 'queued');

  const failed = await run('fail', { ...ENV, ERROR_MESSAGE: '  multi\n line   msg ' }, fetchImpl);
  assert.equal(failed.fail.length, 1);
  assert.deepEqual(
    { ...status(J) },
    { status: 'failed', deploy_ref: null, error: 'multi line msg' },
  );
  assert.equal((await run('fail', ENV, fetchImpl)).fail.length, 0, 'already failed: unchanged');

  const other = '77777777-2222-3333-4444-555555555555';
  add(other, 'building', new Date().toISOString());
  assert.equal((await run('finish', { ...ENV, JOB_ID: other }, fetchImpl)).finish.length, 1);
  assert.equal(status(other).status, 'deployed');
});

test('the API token goes only in the Authorization header, and never into errors', async () => {
  const { raw, add } = jobs();
  add(J, 'building', new Date().toISOString());
  const ok = d1HttpMock(raw);
  await run('finish', ENV, ok.fetchImpl);
  const [call] = ok.calls;
  assert.equal(
    call.url,
    'https://api.cloudflare.com/client/v4/accounts/acct/d1/database/db1/query',
  );
  assert.equal(call.headers.authorization, 'Bearer secret-token-123');
  assert.ok(!call.url.includes('secret-token') && !call.body.includes('secret-token'));

  const denied = d1HttpMock(raw, { status: 403 });
  await assert.rejects(
    () => run('finish', ENV, denied.fetchImpl),
    (e: Error) => e.message === 'finish failed (D1 request failed (HTTP 403))',
  );
  const broken = d1HttpMock(raw);
  await assert.rejects(
    () => run('finish', { ...ENV, JOB_ID: 'not-a-job' }, broken.fetchImpl),
    (e: Error) => !e.message.includes('secret-token'),
  );
  await assert.rejects(() => run('finish', { JOB_ID: J }, ok.fetchImpl), /required/);
});

test('d1Query: rows on success, status or error code (never body text) on failure', async () => {
  const { raw } = testDb();
  const config = { accountId: 'a', databaseId: 'd', apiToken: 'secret-token-123' };
  raw.exec("INSERT INTO faqs (group_key, question) VALUES ('g', 'Q')");
  const rows = await d1Query<{ question: string }>(
    config,
    'SELECT question FROM faqs WHERE group_key = ?',
    ['g'],
    d1HttpMock(raw).fetchImpl,
  );
  assert.deepEqual(rows, [{ question: 'Q' }]);

  await assert.rejects(
    () => d1Query(config, 'SELECT nope FROM nowhere', [], d1HttpMock(raw).fetchImpl),
    (e: Error) => e.message === 'D1 query failed (code 7500)',
  );
  await assert.rejects(
    () =>
      d1Query(
        { ...config, baseUrl: 'http://localhost:1/' },
        'SELECT 1',
        [],
        d1HttpMock(raw, { status: 500 }).fetchImpl,
      ),
    (e: Error) => e.message === 'D1 request failed (HTTP 500)',
  );
  const mock = d1HttpMock(raw);
  await d1Query(
    { ...config, baseUrl: 'http://localhost:1/' },
    'SELECT 1 AS one',
    [],
    mock.fetchImpl,
  );
  assert.ok(mock.calls[0].url.startsWith('http://localhost:1/accounts/a/'));
});
