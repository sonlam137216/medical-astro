import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Server-only. The secret key bypasses RLS, so this must never be imported from client code.
export function createServiceClient(env: { SUPABASE_URL?: string; SUPABASE_SECRET_KEY?: string }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return null;
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    // Stateless: a Worker request has no browser session to persist or refresh.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
