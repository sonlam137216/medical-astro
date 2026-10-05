import type { AstroCookies } from 'astro';
import { createDb, type Db, type SqlDatabase } from './db.ts';
import { DUMMY_HASH, verifyPassword } from './password.ts';

// Admin sign-in, on Cloudflare D1 (no external auth service).
//
// The browser holds one random session token in an httpOnly cookie scoped to /admin. The database stores only
// the token's SHA-256 in `admin_sessions`, so a copy of the database cannot be used to sign in, and deleting a
// row signs that session out at once. Authorisation is by middleware: every /admin request is authenticated
// here before any handler runs, and there is one role (admin = a row in `admins`).
//
// This file is the only code that reads `admins` and `admin_sessions` (they are not in the table registry).

export const SESSION_COOKIE = 'mt-session';
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
const COOKIE_PATH = '/admin';

export type AdminDb = Db;
export interface AdminUser {
  id: string;
  email: string;
}
export interface AdminContext {
  admin: AdminUser;
  db: AdminDb;
}

/** SHA-256 hex. Session tokens are 256 random bits, so a fast hash is enough to protect them at rest. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const first = async <T>(
  sql: SqlDatabase,
  query: string,
  ...params: unknown[]
): Promise<T | null> => {
  const { results } = await sql
    .prepare(query)
    .bind(...params)
    .all();
  return ((results ?? [])[0] as T | undefined) ?? null;
};

/** Check email + password and open a session. Returns null for any failure (the caller shows one message). */
export async function signIn(
  sql: SqlDatabase,
  email: string,
  password: string,
  now = new Date(),
): Promise<{ admin: AdminUser; token: string } | null> {
  const row = await first<{ id: string; email: string; password_hash: string }>(
    sql,
    'SELECT id, email, password_hash FROM admins WHERE email = ?',
    email.trim(),
  );
  // Always do the expensive hash, so a missing account is not faster than a wrong password.
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) return null;

  const token = newToken();
  const at = now.toISOString();
  await sql.batch([
    sql.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(at),
    sql
      .prepare('INSERT INTO admin_sessions (admin_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .bind(
        row.id,
        await sha256Hex(token),
        new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString(),
      ),
    sql.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?').bind(at, row.id),
  ]);
  return { admin: { id: row.id, email: row.email }, token };
}

/** The admin behind a session token, with a database handle that records their changes in the audit log. */
export async function authenticate(
  sql: SqlDatabase | undefined,
  cookies: AstroCookies,
  now = new Date(),
): Promise<AdminContext | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!sql || !token || token.length > 100) return null;

  const row = await first<{ id: string; email: string }>(
    sql,
    'SELECT a.id AS id, a.email AS email FROM admin_sessions s JOIN admins a ON a.id = s.admin_id ' +
      'WHERE s.token_hash = ? AND s.expires_at > ?',
    await sha256Hex(token),
    now.toISOString(),
  );
  if (!row) return null;
  return {
    admin: { id: row.id, email: row.email },
    db: createDb(sql, { actorId: row.id, audit: true }),
  };
}

/** Sign out: the session row is deleted, so a copied cookie stops working too. */
export async function signOut(sql: SqlDatabase | undefined, cookies: AstroCookies): Promise<void> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (sql && token && token.length <= 100) {
    await sql
      .prepare('DELETE FROM admin_sessions WHERE token_hash = ?')
      .bind(await sha256Hex(token))
      .all();
  }
  clearSessionCookie(cookies);
}

export function setSessionCookie(cookies: AstroCookies, token: string, secure: boolean) {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: SESSION_SECONDS,
  });
}

export function clearSessionCookie(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE, { path: COOKIE_PATH });
}

/** Admin forms are same-origin POSTs; refuse anything else (Astro's own check only covers form types). */
export function isSameOrigin(request: Request): boolean {
  return request.headers.get('origin') === new URL(request.url).origin;
}
