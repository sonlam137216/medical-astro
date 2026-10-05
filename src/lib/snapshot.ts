import type { AdminDb } from './admin-auth';

// What the public site is built from. A snapshot is a complete copy of the published content; the build
// reads one snapshot (never the working-copy tables), so a half-edited draft cannot leak into a build.
// Bump SNAPSHOT_SCHEMA_VERSION when the shape changes in a breaking way.
export const SNAPSHOT_SCHEMA_VERSION = 1;

export interface SnapshotDoctor {
  slug: string;
  name: string;
  role: string | null;
  bio: string | null;
  credentials: string[];
  languages: string[];
}

export interface Snapshot {
  doctors: SnapshotDoctor[];
}

/** Working copy -> snapshot. Only visible items are included, in display order. */
export async function buildSnapshot(db: AdminDb): Promise<Snapshot> {
  const { data, error } = await db
    .from('doctors')
    .select('slug, full_name, role_title, bio, credentials, languages')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .order('full_name', { ascending: true });
  if (error) throw new Error(`snapshot: could not read doctors (${error.code})`);

  return {
    doctors: data.map((d) => ({
      slug: d.slug,
      name: d.full_name,
      role: d.role_title,
      bio: d.bio,
      credentials: d.credentials,
      languages: d.languages,
    })),
  };
}

/** SHA-256 hex of the snapshot. Objects are built with a fixed key order, so equal content gives equal hashes. */
export async function hashSnapshot(snapshot: Snapshot): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Runtime check for a snapshot read back from the database (it is jsonb, so not typed). */
export function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) return false;
  const doctors = (value as { doctors?: unknown }).doctors;
  return (
    Array.isArray(doctors) &&
    doctors.every(
      (d) =>
        typeof d === 'object' &&
        d !== null &&
        typeof d.slug === 'string' &&
        typeof d.name === 'string' &&
        Array.isArray(d.credentials) &&
        Array.isArray(d.languages),
    )
  );
}
