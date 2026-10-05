import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authenticate, sha256Hex, signIn, signOut, SESSION_COOKIE } from '../src/lib/admin-auth.ts';
import { hashPassword, passwordProblem, verifyPassword, DUMMY_HASH } from '../src/lib/password.ts';
import { testDb } from './helpers/sqlite.ts';

// A fast hash for tests (the real default is 100,000 iterations).
const fastHash = (pw: string) => hashPassword(pw, 1000);

const cookies = (token?: string) =>
  ({
    get: (name: string) => (name === SESSION_COOKIE && token ? { value: token } : undefined),
    delete: () => undefined,
  }) as never;

async function withAdmin(password = 'correct horse battery') {
  const { raw, sql } = testDb();
  raw
    .prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)')
    .run('Boss@Example.com', await fastHash(password));
  return { raw, sql };
}

test('password hashes: salted, verifiable, tamper-evident', async () => {
  const a = await fastHash('a long enough password');
  const b = await fastHash('a long enough password');
  assert.notEqual(a, b, 'a fresh salt each time');
  assert.match(a, /^pbkdf2-sha256\$1000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.ok(await verifyPassword('a long enough password', a));
  assert.ok(!(await verifyPassword('a long enough passworD', a)));
  assert.ok(!(await verifyPassword('', a)));
  for (const bad of [
    '',
    'plain',
    'pbkdf2-sha256$x$y$z',
    'md5$1$AA==$AA==',
    a.replace('$1000$', '$0$'),
    a.slice(0, -4),
  ]) {
    assert.ok(!(await verifyPassword('a long enough password', bad)), bad);
  }
  assert.ok(!(await verifyPassword('anything', DUMMY_HASH)));
  assert.ok(
    DUMMY_HASH.startsWith('pbkdf2-sha256$100000$'),
    'the dummy costs what a real hash costs',
  );
});

test('the default cost matches what Workers allows', async () => {
  const hash = await hashPassword('twelve chars!!');
  assert.ok(hash.startsWith('pbkdf2-sha256$100000$'));
  assert.ok(await verifyPassword('twelve chars!!', hash));
});

test('new passwords must be long enough', () => {
  assert.match(passwordProblem('short')!, /at least 12/);
  assert.equal(passwordProblem('twelve chars!'), null);
  assert.match(passwordProblem('x'.repeat(300))!, /at most/);
});

test('sign in opens a session; only the token hash is stored', async () => {
  const { raw, sql } = await withAdmin();
  const now = new Date('2026-10-05T10:00:00.000Z');
  const session = await signIn(sql, ' boss@example.com ', 'correct horse battery', now);
  assert.ok(session);
  assert.equal(session.admin.email, 'Boss@Example.com');
  assert.ok(session.token.length >= 43);

  const rows = raw.prepare('SELECT token_hash, expires_at FROM admin_sessions').all() as {
    token_hash: string;
    expires_at: string;
  }[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, await sha256Hex(session.token));
  assert.ok(!JSON.stringify(rows).includes(session.token));
  assert.equal(rows[0].expires_at, '2026-10-12T10:00:00.000Z');
  assert.equal(
    (raw.prepare('SELECT last_login_at FROM admins').get() as { last_login_at: string })
      .last_login_at,
    '2026-10-05T10:00:00.000Z',
  );
});

test('sign in fails the same way for a wrong password and an unknown account', async () => {
  const { raw, sql } = await withAdmin();
  assert.equal(await signIn(sql, 'boss@example.com', 'wrong password!!'), null);
  assert.equal(await signIn(sql, 'nobody@example.com', 'correct horse battery'), null);
  assert.equal(await signIn(sql, "x' OR '1'='1", 'correct horse battery'), null);
  assert.equal((raw.prepare('SELECT COUNT(*) n FROM admin_sessions').get() as { n: number }).n, 0);
});

test('a session is accepted until it expires, then refused', async () => {
  const { sql } = await withAdmin();
  const start = new Date('2026-10-05T10:00:00.000Z');
  const { token } = (await signIn(sql, 'boss@example.com', 'correct horse battery', start))!;

  const ok = await authenticate(sql, cookies(token), new Date('2026-10-11T10:00:00.000Z'));
  assert.equal(ok?.admin.email, 'Boss@Example.com');
  assert.equal(await authenticate(sql, cookies(token), new Date('2026-10-12T10:00:00.001Z')), null);
  assert.equal(await authenticate(sql, cookies('not-a-token'), start), null);
  assert.equal(await authenticate(sql, cookies(), start), null);
  assert.equal(await authenticate(sql, cookies('x'.repeat(500)), start), null);
  assert.equal(
    await authenticate(undefined, cookies(token), start),
    null,
    'no database binding: nobody gets in',
  );
});

test('changes made through the signed-in handle are attributed to that admin', async () => {
  const { raw, sql } = await withAdmin();
  const { token, admin } = (await signIn(sql, 'boss@example.com', 'correct horse battery'))!;
  const context = (await authenticate(sql, cookies(token)))!;
  await context.db.from('faqs').insert({ group_key: 'g', question: 'Q' });
  const log = raw.prepare('SELECT actor_id, action FROM audit_logs').all();
  assert.deepEqual(
    log.map((l) => ({ ...l })),
    [{ actor_id: admin.id, action: 'insert' }],
  );
});

test('sign out ends the session on the server, so a copied cookie stops working', async () => {
  const { raw, sql } = await withAdmin();
  const { token } = (await signIn(sql, 'boss@example.com', 'correct horse battery'))!;
  assert.ok(await authenticate(sql, cookies(token)));
  await signOut(sql, cookies(token));
  assert.equal(await authenticate(sql, cookies(token)), null);
  assert.equal((raw.prepare('SELECT COUNT(*) n FROM admin_sessions').get() as { n: number }).n, 0);
});

test('signing in clears expired sessions', async () => {
  const { raw, sql } = await withAdmin();
  const old = new Date('2026-01-01T00:00:00.000Z');
  await signIn(sql, 'boss@example.com', 'correct horse battery', old);
  await signIn(
    sql,
    'boss@example.com',
    'correct horse battery',
    new Date('2026-10-05T10:00:00.000Z'),
  );
  assert.equal(
    (raw.prepare('SELECT COUNT(*) n FROM admin_sessions').get() as { n: number }).n,
    1,
    'the expired one is gone',
  );
});
