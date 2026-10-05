import { env } from 'cloudflare:workers';
import { d1Query } from './d1-http';
import type { Img } from '../data/types';
import { doctorProfiles } from '../data/shared';
import { toPublicImage, type PublicImage } from './media';
import { SNAPSHOT_SCHEMA_VERSION, isSnapshot, type Snapshot } from './snapshot';

// BUILD-TIME ONLY. Public pages are prerendered, so this runs while `astro build` runs and never per
// visit. Do not call it from a request handler: that would query the database on every page view.

export interface PublicDoctor {
  name: string;
  role: string | null;
  bio: string | null;
  credentials: string[];
  languages: string[];
  /** A static sample photo, or an image from the media library. Absent: the UI shows initials. */
  image?: Img | PublicImage;
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
  // The build runs outside a Worker (in CI or on a laptop), so it reads D1 over Cloudflare's HTTP API.
  const accountId = setting('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = setting('CLOUDFLARE_API_TOKEN');
  const databaseId = setting('D1_DATABASE_ID');
  if (!accountId || !apiToken || !databaseId) {
    console.warn('[content] no D1 credentials: building with the built-in sample content');
    return null;
  }
  const config = { accountId, apiToken, databaseId, baseUrl: setting('CLOUDFLARE_API_URL') };

  const wanted = setting('CONTENT_REVISION_ID');
  const columns = 'revision_number, snapshot, snapshot_schema_version';
  let rows: { revision_number: number; snapshot: string; snapshot_schema_version: number }[];
  try {
    rows = wanted
      ? await d1Query(config, `SELECT ${columns} FROM content_revisions WHERE id = ?`, [wanted])
      : await d1Query(
          config,
          `SELECT ${columns} FROM content_revisions ORDER BY revision_number DESC LIMIT 1`,
        );
  } catch (error) {
    throw new Error(
      `[content] could not read the published revision (${error instanceof Error ? error.message : 'error'})`,
      { cause: error },
    );
  }

  const data = rows[0];
  if (!data) {
    if (wanted) throw new Error('[content] CONTENT_REVISION_ID does not match any revision');
    console.warn('[content] nothing published yet: building with the built-in sample content');
    return null;
  }
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(data.snapshot);
  } catch {
    snapshot = null;
  }
  if (data.snapshot_schema_version !== SNAPSHOT_SCHEMA_VERSION || !isSnapshot(snapshot)) {
    throw new Error(
      `[content] revision ${data.revision_number} has an unsupported snapshot format`,
    );
  }
  console.log(`[content] building from revision ${data.revision_number}`);
  return snapshot;
}

/** Doctors for the public pages: the published list, or the sample list before the first publish. */
export async function getDoctors(): Promise<PublicDoctor[]> {
  const snapshot = await loadSnapshot();
  if (snapshot?.doctors) {
    const publicBase = setting('R2_PUBLIC_BASE_URL');
    return snapshot.doctors.map((d) => ({
      name: d.name,
      role: d.role,
      bio: d.bio,
      credentials: d.credentials,
      languages: d.languages,
      image:
        (d.image &&
          toPublicImage(
            {
              r2_key: d.image.key,
              width: d.image.width,
              height: d.image.height,
              alt_text: d.image.alt,
              is_decorative: d.image.decorative,
              variant_widths: d.image.widths,
            },
            publicBase,
          )) ||
        undefined,
    }));
  }
  return doctorProfiles.map((d) => ({ ...d, languages: ['English'] }));
}

export interface PublicFaq {
  question: string;
  /** Null for sample questions: the design shows no answers, and answers must come from the clinic. */
  answer: string | null;
}

/** Questions of one group: the published, answered ones, or the sample questions before any are published. */
export async function getFaqs(group: string, sampleQuestions: string[]): Promise<PublicFaq[]> {
  const published = (await loadSnapshot())?.faqs?.filter((f) => f.group === group) ?? [];
  if (published.length > 0)
    return published.map((f) => ({ question: f.question, answer: f.answer }));
  return sampleQuestions.map((question) => ({ question, answer: null }));
}
