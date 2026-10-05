import { env } from 'cloudflare:workers';
import { createClient } from '@supabase/supabase-js';
import type { Img } from '../data/types';
import { doctorProfiles } from '../data/shared';
import { SNAPSHOT_SCHEMA_VERSION, isSnapshot, type Snapshot } from './snapshot';
import type { Database } from '../types/database';

// BUILD-TIME ONLY. Public pages are prerendered, so this runs while `astro build` runs and never per
// visit. Do not call it from a request handler: that would query the database on every page view.

export interface PublicDoctor {
  name: string;
  role: string | null;
  bio: string | null;
  credentials: string[];
  languages: string[];
  /** Absent for CMS doctors until media (R2) is connected; the UI then shows initials. */
  image?: Img;
}

/** Build settings come from the Worker env (.dev.vars locally) or, when present, the process environment (CI). */
function setting(name: string): string | undefined {
  const fromWorker = (env as unknown as Record<string, string | undefined>)[name];
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return fromWorker || processEnv?.[name] || undefined;
}

let cached: Promise<Snapshot | null> | undefined;

/**
 * The published content for this build:
 *  - `CONTENT_REVISION_ID` set: that revision (reproducible build of a specific publish);
 *  - otherwise the most recent revision;
 *  - `null` when there is nothing to read (no credentials, or nothing published yet), in which case
 *    pages use the built-in sample content from src/data.
 * A read error fails the build on purpose: silently shipping stale sample content would be worse.
 */
export function loadSnapshot(): Promise<Snapshot | null> {
  return (cached ??= read());
}

async function read(): Promise<Snapshot | null> {
  const url = setting('SUPABASE_URL');
  const key = setting('SUPABASE_SECRET_KEY');
  if (!url || !key) {
    console.warn('[content] no Supabase credentials: building with the built-in sample content');
    return null;
  }

  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const wanted = setting('CONTENT_REVISION_ID');
  const base = client
    .from('content_revisions')
    .select('revision_number, snapshot, snapshot_schema_version');
  const { data, error } = await (wanted
    ? base.eq('id', wanted).maybeSingle()
    : base.order('revision_number', { ascending: false }).limit(1).maybeSingle());

  if (error) throw new Error(`[content] could not read the published revision (${error.code})`);
  if (!data) {
    if (wanted) throw new Error('[content] CONTENT_REVISION_ID does not match any revision');
    console.warn('[content] nothing published yet: building with the built-in sample content');
    return null;
  }
  if (data.snapshot_schema_version !== SNAPSHOT_SCHEMA_VERSION || !isSnapshot(data.snapshot)) {
    throw new Error(
      `[content] revision ${data.revision_number} has an unsupported snapshot format`,
    );
  }
  console.log(`[content] building from revision ${data.revision_number}`);
  return data.snapshot;
}

/** Doctors for the public pages: the published list, or the sample list before the first publish. */
export async function getDoctors(): Promise<PublicDoctor[]> {
  const snapshot = await loadSnapshot();
  if (snapshot) {
    return snapshot.doctors.map((d) => ({
      name: d.name,
      role: d.role,
      bio: d.bio,
      credentials: d.credentials,
      languages: d.languages,
    }));
  }
  return doctorProfiles.map((d) => ({ ...d, languages: ['English'] }));
}
