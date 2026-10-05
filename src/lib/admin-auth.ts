import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import type { Database } from '../types/database';

// Admin sign-in. The browser only ever holds the user's own Supabase JWT (httpOnly cookies scoped to
// /admin). Every admin query runs with that JWT and the publishable key, so Row Level Security
// (`is_admin()`) decides what is allowed. The secret key is never used here.

export const ACCESS_COOKIE = 'mt-access';
export const REFRESH_COOKIE = 'mt-refresh';
const COOKIE_PATH = '/admin';
const REFRESH_MAX_AGE = 60 * 60 * 24 * 7;

export type AdminDb = SupabaseClient<Database>;
export interface AdminUser {
  id: string;
  email: string;
}
export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
export interface AdminContext {
  admin: AdminUser;
  db: AdminDb;
  /** Set when the access token had expired and a refresh token produced a new session. */
  refreshed: SessionTokens | null;
}

type Env = { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string };

/** Client acting as the signed-in user (when `accessToken` is given) or as an anonymous caller. */
export function createUserClient(env: Env, accessToken?: string): AdminDb | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

/** Read claims for display only. Call this after the database accepted the token, never to trust it. */
function claimsOf(token: string): { sub?: string; email?: string } {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return {};
  }
}

/** The database validates the JWT itself; `is_admin()` is true only for users listed in `public.admins`. */
export async function verifyAdmin(
  env: Env,
  accessToken: string,
): Promise<{ admin: AdminUser; db: AdminDb } | null> {
  const db = createUserClient(env, accessToken);
  if (!db) return null;
  const { data, error } = await db.rpc('is_admin');
  if (error || data !== true) return null;
  const claims = claimsOf(accessToken);
  if (!claims.sub) return null;
  return { admin: { id: claims.sub, email: claims.email ?? '' }, db };
}

export async function authenticate(env: Env, cookies: AstroCookies): Promise<AdminContext | null> {
  const access = cookies.get(ACCESS_COOKIE)?.value;
  if (access) {
    const ok = await verifyAdmin(env, access);
    if (ok) return { ...ok, refreshed: null };
  }

  const refresh = cookies.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    const anon = createUserClient(env);
    const { data, error } = anon
      ? await anon.auth.refreshSession({ refresh_token: refresh })
      : { data: null, error: true };
    if (!error && data?.session) {
      const ok = await verifyAdmin(env, data.session.access_token);
      if (ok) return { ...ok, refreshed: data.session };
    }
  }
  return null;
}

export function setSessionCookies(cookies: AstroCookies, session: SessionTokens, secure: boolean) {
  const base = { httpOnly: true, secure, sameSite: 'lax' as const, path: COOKIE_PATH };
  cookies.set(ACCESS_COOKIE, session.access_token, { ...base, maxAge: session.expires_in });
  cookies.set(REFRESH_COOKIE, session.refresh_token, { ...base, maxAge: REFRESH_MAX_AGE });
}

export function clearSessionCookies(cookies: AstroCookies) {
  cookies.delete(ACCESS_COOKIE, { path: COOKIE_PATH });
  cookies.delete(REFRESH_COOKIE, { path: COOKIE_PATH });
}

/** Admin forms are same-origin POSTs; refuse anything else (Astro's own check only covers form types). */
export function isSameOrigin(request: Request): boolean {
  return request.headers.get('origin') === new URL(request.url).origin;
}
