import { env } from 'cloudflare:workers';
import { d1Query } from './d1-http';
import type { Img } from '../data/types';
import { doctorProfiles } from '../data/shared';
import { destinations as sampleDestinations, services as sampleServices } from '../data/home';
import {
  serviceDetails as sampleServiceDetails,
  packageCards as samplePackages,
} from '../data/shared';
import { discover as sampleDiscover } from '../data/packages';
import { formatPrice, servicePath } from './services';
import { mergeSection } from './cms/sections';
import { SECTION_SAMPLES, type SectionKey } from '../data/sections';
import { directionsUrl } from './maps';
import { toPublicImage, type PublicImage } from './media';
import { SNAPSHOT_SCHEMA_VERSION, isSnapshot, type Snapshot } from './snapshot';
import { articlePath, type ArticleKind } from './cms/articles';

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

/** Origin of the media CDN (custom domain on the R2 bucket), if one is configured. Build time only. */
export function getMediaOrigin(): string | null {
  const base = setting('R2_PUBLIC_BASE_URL');
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

/** Public base URL of the media bucket (custom domain), if one is configured. Build time only. */
export function getPublicBase(): string | null {
  return setting('R2_PUBLIC_BASE_URL') ?? null;
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

export interface PublicService {
  slug: string | null;
  title: string;
  /** Short description for the Services page. */
  summary: string | null;
  inclusions: string[];
  /** Shown as written; null: no price line. */
  priceText: string | null;
  href: string;
  /** True when the service has a page of its own to link to. */
  hasPage: boolean;
  /** A static sample photo or an image from the media library; absent: the card shows no picture. */
  image?: Img | PublicImage;
}

/** Services for the public pages: the published list, or the sample cards before the first publish. */
export async function getServices(): Promise<PublicService[]> {
  const snapshot = await loadSnapshot();
  if (snapshot?.services) {
    const publicBase = setting('R2_PUBLIC_BASE_URL');
    return snapshot.services.map((s) => ({
      slug: s.slug,
      title: s.title,
      summary: s.summary,
      inclusions: s.inclusions,
      priceText: s.priceText,
      ...servicePath(s.slug),
      image:
        (s.image &&
          toPublicImage(
            {
              r2_key: s.image.key,
              width: s.image.width,
              height: s.image.height,
              alt_text: s.image.alt,
              is_decorative: s.image.decorative,
              variant_widths: s.image.widths,
            },
            publicBase,
          )) ||
        undefined,
    }));
  }
  return sampleServices.map((s, i) => ({
    slug: null,
    title: s.title,
    summary: sampleServiceDetails[i]?.body ?? null,
    inclusions: s.inclusions,
    priceText: s.total,
    href: s.href,
    hasPage: true,
    image: s.image,
  }));
}

export type PackageKind = 'single_treatment' | 'travel_combo';

export interface PublicPackage {
  title: string;
  inclusions: string[];
  /** "TOTAL: $600"; null: no price line. */
  total: string | null;
  note: string | null;
  href: string;
  linkLabel: string;
  image?: Img | PublicImage;
}

const toPublicImageOrUndefined = (
  image:
    | {
        key: string;
        width: number;
        height: number;
        alt: string | null;
        decorative: boolean;
        widths: number[];
      }
    | null
    | undefined,
) =>
  (image &&
    toPublicImage(
      {
        r2_key: image.key,
        width: image.width,
        height: image.height,
        alt_text: image.alt,
        is_decorative: image.decorative,
        variant_widths: image.widths,
      },
      setting('R2_PUBLIC_BASE_URL'),
    )) ||
  undefined;

/**
 * Package cards of one page: the published ones, or the sample cards before the first publish. Published but
 * none for this page: an empty list (the page then hides the section).
 */
export async function getPackages(kind: PackageKind): Promise<PublicPackage[]> {
  const snapshot = await loadSnapshot();
  if (snapshot?.packages) {
    return snapshot.packages
      .filter((p) => p.kind === kind)
      .map((p) => {
        const link = p.service ? servicePath(p.service) : null;
        return {
          title: p.title,
          inclusions: p.inclusions,
          total: p.price ? `TOTAL: ${formatPrice(p.price.amount, p.price.currency)}` : null,
          note: p.price ? p.priceConditions : null,
          href: link?.href ?? '#consultation',
          linkLabel: link ? 'Learn more' : 'Request a quote',
          image: toPublicImageOrUndefined(p.image),
        };
      });
  }
  return samplePackages.map((p) => ({
    title: p.title,
    inclusions: p.inclusions,
    total: p.total,
    note: null,
    href: p.href,
    linkLabel: 'Learn more',
    image: p.image,
  }));
}

export interface PublicDestination {
  name: string;
  /** The description; PublicLocation-shaped so the same card shows it. */
  address: string;
  href: string;
  linkLabel: string;
  image?: Img | PublicImage;
}

/** "Discover Vietnam" cards: the published destinations, or the sample cards before the first publish. */
export async function getDestinations(): Promise<PublicDestination[]> {
  const snapshot = await loadSnapshot();
  if (snapshot?.destinations) {
    return snapshot.destinations.map((d) => ({
      name: d.name,
      address: d.summary ?? '',
      href: '/travel-guide',
      linkLabel: 'Explore more',
      image: toPublicImageOrUndefined(d.image),
    }));
  }
  return sampleDiscover.cards;
}

export interface PublicLocation {
  name: string;
  address: string;
  /** Directions: the published link, or a map search for the address. */
  href: string;
  /** A static sample photo or an image from the media library; absent: the card shows no picture. */
  image?: Img | PublicImage;
}

/** Clinics for the public pages: the published list, or the sample clinics before the first publish. */
export async function getLocations(): Promise<PublicLocation[]> {
  const snapshot = await loadSnapshot();
  if (snapshot?.locations) {
    const publicBase = setting('R2_PUBLIC_BASE_URL');
    return snapshot.locations.map((l) => {
      const address = l.address ?? '';
      return {
        name: l.name,
        address,
        href: l.directionsUrl || directionsUrl(address) || '/locations',
        image:
          (l.image &&
            toPublicImage(
              {
                r2_key: l.image.key,
                width: l.image.width,
                height: l.image.height,
                alt_text: l.image.alt,
                is_decorative: l.image.decorative,
                variant_widths: l.image.widths,
              },
              publicBase,
            )) ||
          undefined,
      };
    });
  }
  return sampleDestinations.locations;
}

type Section<K extends SectionKey> = (typeof SECTION_SAMPLES)[K] & {
  chosenPhotos: Record<string, PublicImage>;
  edited: boolean;
};

/**
 * The text of a page section: the published version laid over the built-in `sample` (see mergeSection), or the
 * sample itself before the section has been edited (`edited` tells which). `null`: the section was switched off.
 * `chosenPhotos` holds the photos chosen for it, by field name.
 */
export async function getSection<K extends SectionKey>(key: K): Promise<Section<K> | null> {
  const sample = SECTION_SAMPLES[key];
  const row = (await loadSnapshot())?.sections?.find((s) => s.key === key);
  if (!row) return { ...sample, chosenPhotos: {}, edited: false } as Section<K>;
  if (!row.visible) return null;
  const photos: Record<string, PublicImage> = {};
  for (const [name, image] of Object.entries(row.images ?? {})) {
    const photo = toPublicImageOrUndefined(image);
    if (photo) photos[name] = photo;
  }
  return {
    ...mergeSection(sample as Record<string, unknown>, row.data),
    chosenPhotos: photos,
    edited: true,
  } as Section<K>;
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

export interface PublicArticle {
  slug: string;
  kind: ArticleKind;
  /** Address of the detail page, e.g. /travel-guide/da-nang. */
  path: string;
  title: string;
  excerpt: string | null;
  /** Source text in the format of src/lib/cms/articles.ts; render it with parseArticleBody. */
  body: string | null;
  cover: PublicImage | null;
  category: { slug: string; name: string } | null;
  author: string | null;
  reviewedBy: string | null;
  reviewedOn: string | null;
  publishedOn: string | null;
  updatedOn: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

/**
 * Published articles of one kind, newest first. Empty before the first publish that includes articles: there
 * is no sample article content, so pages that list articles show their sample cards (Home) or an empty state.
 */
export async function getArticles(kind: ArticleKind): Promise<PublicArticle[]> {
  const snapshot = await loadSnapshot();
  const publicBase = setting('R2_PUBLIC_BASE_URL');
  const categories = new Map((snapshot?.articleCategories ?? []).map((c) => [c.slug, c.name]));
  return (snapshot?.articles ?? [])
    .filter((a) => a.kind === kind)
    .map((a) => ({
      slug: a.slug,
      kind,
      path: articlePath(kind, a.slug),
      title: a.title,
      excerpt: a.excerpt,
      body: a.body,
      cover:
        (a.coverImage &&
          toPublicImage(
            {
              r2_key: a.coverImage.key,
              width: a.coverImage.width,
              height: a.coverImage.height,
              alt_text: a.coverImage.alt,
              is_decorative: a.coverImage.decorative,
              variant_widths: a.coverImage.widths,
            },
            publicBase,
          )) ||
        null,
      category:
        a.category && categories.has(a.category)
          ? { slug: a.category, name: categories.get(a.category) as string }
          : null,
      author: a.author,
      reviewedBy: a.reviewedBy,
      reviewedOn: a.reviewedOn,
      publishedOn: a.publishedOn,
      updatedOn: a.updatedOn,
      seoTitle: a.seoTitle,
      seoDescription: a.seoDescription,
    }));
}

/** Categories (filters) of one kind that are shown, in display order. */
export async function getArticleCategories(
  kind: ArticleKind,
): Promise<{ slug: string; name: string }[]> {
  const snapshot = await loadSnapshot();
  return (snapshot?.articleCategories ?? [])
    .filter((c) => c.kind === kind)
    .map((c) => ({ slug: c.slug, name: c.name }));
}

/** True before the first publish (or without database credentials): pages then use the built-in sample content. */
export async function isSampleContent(): Promise<boolean> {
  return (await loadSnapshot()) === null;
}
