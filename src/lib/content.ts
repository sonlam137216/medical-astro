import { env } from 'cloudflare:workers';
import { d1Query } from './d1-http';
import type { Img } from '../data/types';
import { doctorProfiles } from '../data/shared';
import { destinations as sampleDestinations, services as sampleServices } from '../data/home';
import {
  serviceDetails as sampleServiceDetails,
  packageCards as samplePackages,
} from '../data/shared';
import { comboCards as sampleCombos, discover as sampleDiscover } from '../data/packages';
import {
  costCards as sampleImplantCards,
  situations as sampleImplantSituations,
  situationsLabel as sampleImplantSituationsLabel,
} from '../data/implants';
import { formatPrice, servicePath } from './services';
import { mergeSection, sectionByKey, sectionShown } from './cms/sections';
import { SECTION_SAMPLES, type SectionKey } from '../data/sections';
import { directionsUrl } from './maps';
import { snapshotImageInput, toPublicImage, type PublicImage } from './media';
import {
  SNAPSHOT_SCHEMA_VERSION,
  isSnapshot,
  type Snapshot,
  type SnapshotArticle,
  type SnapshotImage,
} from './snapshot';
import { articlePath, isArticleKind, type ArticleKind } from './cms/articles';

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

/** Turnstile site key (public, written into the forms) when the spam check is switched on. Build time only. */
export function getTurnstileSiteKey(): string | null {
  return setting('TURNSTILE_SITE_KEY') ?? null;
}

/** Public base URL of the media bucket (custom domain), if one is configured. Build time only. */
export function getPublicBase(): string | null {
  return setting('R2_PUBLIC_BASE_URL') ?? null;
}

let cached: Promise<Snapshot | null> | undefined;
let cachedAt = 0;

/**
 * The published content for this build:
 *  - `CONTENT_REVISION_ID` set: that revision (reproducible build of a specific publish);
 *  - otherwise the most recent revision;
 *  - `null` when there is nothing to read (no credentials, or nothing published yet), in which case
 *    pages use the built-in sample content from src/data.
 * A read error fails the build on purpose: silently shipping stale sample content would be worse.
 */
export function loadSnapshot(): Promise<Snapshot | null> {
  // `astro dev` keeps this module alive, so re-read now and then to show a revision published meanwhile.
  // A build never does: it is one process and must see one revision throughout.
  if (import.meta.env?.DEV && Date.now() - cachedAt > 3000) cached = undefined;
  if (!cached) cachedAt = Date.now();
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
      image: (d.image && toPublicImage(snapshotImageInput(d.image), publicBase)) || undefined,
    }));
  }
  return doctorProfiles.map((d) => ({ ...d, languages: ['English'] }));
}

/** A treatment of a service: a price card. */
export interface PublicServiceOption {
  title: string;
  subtitle: string | null;
  inclusions: string[];
  /** Shown as written; null: no price line (the card invites a quote request). */
  priceText: string | null;
}

/** A card of "Which treatment fits your situation". */
export interface PublicSituation {
  tag: string | null;
  title: string;
  description: string | null;
}

/** A service: a group of treatments with a page of its own at `href`. */
export interface PublicService {
  slug: string;
  title: string;
  /** Short description: the Services page card and the top of the service's page. */
  summary: string | null;
  /** Longer text of the service's page; paragraphs are separated by a blank line. */
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  href: string;
  /** A static sample photo or an image from the media library; absent: the card shows no picture. */
  image?: Img | PublicImage;
  /** The wide picture at the top of the service's page; absent: the default banner. */
  banner?: PublicImage;
  options: PublicServiceOption[];
  /** The "Which treatment fits your situation" cards; empty: the block is not shown. */
  situations: PublicSituation[];
  /** The small heading above the cards; null: the heading of Page text. */
  situationsLabel: string | null;
  /** The before/after pair beside the cards; absent: the cards take the whole width. */
  situationsImages?: { before: PublicImage; after: PublicImage };
}

/** A price card of the Home page: a treatment ticked "Show on the Home page", linking to its service. */
export interface PublicHomeTreatment extends PublicServiceOption {
  href: string;
}

/**
 * The services of the CMS, in order. Until the first publish with services, the built-in samples stand in (the five
 * services of the Figma Services page, with the Home page price cards as the treatments of the first three).
 */
export async function getServices(): Promise<PublicService[]> {
  const snapshot = await loadSnapshot();
  if (snapshot?.services) {
    const publicBase = setting('R2_PUBLIC_BASE_URL');
    return snapshot.services.map((s) => ({
      slug: s.slug,
      title: s.title,
      summary: s.summary,
      description: s.description ?? null,
      seoTitle: s.seoTitle ?? null,
      seoDescription: s.seoDescription ?? null,
      href: servicePath(s.slug),
      image: (s.image && toPublicImage(snapshotImageInput(s.image), publicBase)) || undefined,
      banner: (s.banner && toPublicImage(snapshotImageInput(s.banner), publicBase)) || undefined,
      options: (s.options ?? []).map((o) => ({
        title: o.title,
        subtitle: o.subtitle,
        inclusions: o.inclusions,
        priceText: o.priceText,
      })),
      situations: (s.situations ?? []).map((i) => ({
        tag: i.tag,
        title: i.title,
        description: i.description,
      })),
      situationsLabel: s.situationsLabel ?? null,
      situationsImages: publicPair(s.situationsImages),
    }));
  }
  return sampleServiceDetails.map((s) => ({
    slug: s.slug,
    title: s.title,
    summary: s.body,
    description: null,
    seoTitle: null,
    seoDescription: null,
    href: servicePath(s.slug),
    image: s.image,
    // The Dental Implants page has its own sample cards (with a second line); the others take the Home cards.
    options:
      s.slug === 'dental-implants'
        ? sampleImplantCards.map((c) => ({ ...c, priceText: c.total }))
        : sampleServices
            .filter((c) => c.service === s.slug)
            .map((c) => ({
              title: c.title,
              subtitle: null,
              inclusions: c.inclusions,
              priceText: c.total,
            })),
    // Only Dental Implants has sample situations (the design's); the clinic writes those of the other services.
    situations: s.slug === 'dental-implants' ? sampleImplantSituations : [],
    situationsLabel: s.slug === 'dental-implants' ? sampleImplantSituationsLabel : null,
  }));
}

/** A before/after pair of the snapshot, when both pictures can be shown. */
function publicPair(pair: { before: SnapshotImage; after: SnapshotImage } | undefined) {
  const before = toPublicImageOrUndefined(pair?.before);
  const after = toPublicImageOrUndefined(pair?.after);
  return before && after ? { before, after } : undefined;
}

/** One service by its slug (the service's page). */
export async function getService(slug: string): Promise<PublicService | undefined> {
  return (await getServices()).find((s) => s.slug === slug);
}

/**
 * The price cards of the Home page: the treatments ticked "Show on the Home page", in the order of their services.
 * Before the first publish with services: the sample cards of the design.
 */
export async function getHomeTreatments(): Promise<PublicHomeTreatment[]> {
  const snapshot = await loadSnapshot();
  if (snapshot?.services) {
    return snapshot.services.flatMap((s) =>
      (s.options ?? [])
        .filter((o) => o.home)
        .map((o) => ({
          title: o.title,
          subtitle: o.subtitle,
          inclusions: o.inclusions,
          priceText: o.priceText,
          href: servicePath(s.slug),
        })),
    );
  }
  return sampleServices.map((c) => ({
    title: c.title,
    subtitle: null,
    inclusions: c.inclusions,
    priceText: c.total,
    href: servicePath(c.service),
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

const toPublicImageOrUndefined = (image: SnapshotImage | null | undefined) =>
  (image && toPublicImage(snapshotImageInput(image), setting('R2_PUBLIC_BASE_URL'))) || undefined;

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
          href: link ?? '#consultation',
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

/** A Travel Combos price card: the route over the photo, the price and its unit, what is included. */
export interface PublicCombo {
  title: string;
  inclusions: string[];
  /** The amount ("$199"); null: no price line. */
  price: string | null;
  /** What the price is for ("per person"); null: the amount alone. */
  unit: string | null;
  /** A short condition under the price. */
  note: string | null;
  image?: Img | PublicImage;
}

/**
 * The Travel Combos price cards: the published combos, or the design's sample combos before the first publish.
 * Published but no combo: an empty list (the page then hides the section).
 */
export async function getTravelCombos(): Promise<PublicCombo[]> {
  const snapshot = await loadSnapshot();
  if (snapshot?.packages) {
    return snapshot.packages
      .filter((p) => p.kind === 'travel_combo')
      .map((p) => ({
        title: p.title,
        inclusions: p.inclusions,
        price: p.price ? formatPrice(p.price.amount, p.price.currency) : null,
        unit: p.price ? (p.priceUnit ?? null) : null,
        note: p.price ? p.priceConditions : null,
        image: toPublicImageOrUndefined(p.image),
      }));
  }
  return sampleCombos.map((c) => ({ ...c, note: null }));
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
        image: (l.image && toPublicImage(snapshotImageInput(l.image), publicBase)) || undefined,
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
  const def = sectionByKey(key);
  if (!sectionShown(def ?? {}, row.visible)) return null;
  const photos: Record<string, PublicImage> = {};
  for (const [name, image] of Object.entries(row.images ?? {})) {
    const photo = toPublicImageOrUndefined(image);
    if (photo) photos[name] = photo;
  }
  return {
    ...mergeSection(sample as Record<string, unknown>, row.data, def?.fields),
    chosenPhotos: photos,
    edited: true,
  } as Section<K>;
}

export interface PublicFaq {
  question: string;
  /** Null for sample questions: the design shows no answers, and answers must come from the clinic. */
  answer: string | null;
}

/**
 * The questions of the service pages (one list for the whole site): the published, answered ones, or the sample
 * questions before any is published.
 */
export async function getFaqs(sampleQuestions: string[]): Promise<PublicFaq[]> {
  const published = (await loadSnapshot())?.faqs ?? [];
  if (published.length > 0)
    return published.map((f) => ({ question: f.question, answer: f.answer }));
  return sampleQuestions.map((question) => ({ question, answer: null }));
}

export interface PublicSmileResult {
  before: PublicImage;
  after: PublicImage;
}

/**
 * The before/after pairs of the service pages' results slider (Smile results). Empty before any is published:
 * the design's sample photos show a real person, so there is no sample content and the block stays hidden.
 */
export async function getSmileResults(): Promise<PublicSmileResult[]> {
  const pairs = (await loadSnapshot())?.smileResults ?? [];
  return pairs.flatMap((p) => {
    const before = toPublicImageOrUndefined(p.before);
    const after = toPublicImageOrUndefined(p.after);
    return before && after ? [{ before, after }] : [];
  });
}

export interface PublicSmileStory {
  /** Text in the format of src/lib/cms/articles.ts; render it with parseArticleBody. */
  body: string;
  before: PublicImage;
  after: PublicImage;
}

/**
 * The slides of the Home page's "Smile transformations" block (Smile stories), or null before any is published:
 * the block then shows its sample story (built-in text) or nothing (the heading was edited, so it is live).
 */
export async function getSmileStories(): Promise<PublicSmileStory[] | null> {
  const stories = (await loadSnapshot())?.smileStories;
  if (!stories) return null;
  return stories.flatMap((s) => {
    const before = toPublicImageOrUndefined(s.before);
    const after = toPublicImageOrUndefined(s.after);
    return before && after ? [{ body: s.body, before, after }] : [];
  });
}

export interface PublicPressArticle {
  url: string;
  text?: string;
  image: PublicImage;
}

/**
 * The cards of the Home page's "Melatec in the News" block (Press articles). Empty before any is published: the
 * design's samples are real newspaper pages, so there is no sample card and the block is not shown.
 */
export async function getPressArticles(): Promise<PublicPressArticle[]> {
  const articles = (await loadSnapshot())?.pressArticles ?? [];
  return articles.flatMap((a) => {
    const image = toPublicImageOrUndefined(a.image);
    return image ? [{ url: a.url, ...(a.text ? { text: a.text } : {}), image }] : [];
  });
}

export interface PublicLegalPage {
  slug: string;
  title: string;
  /** Source text in the format of src/lib/cms/articles.ts; render it with parseArticleBody. */
  body: string;
  seoDescription: string | null;
}

/** The published legal pages. Empty before any is published: there is no sample legal text, so no such pages. */
export async function getLegalPages(): Promise<PublicLegalPage[]> {
  return (await loadSnapshot())?.legalPages ?? [];
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
  /** Pictures placed in the body (`![caption](media:<id>)`), by media id. */
  bodyImages: Record<string, PublicImage>;
  category: { slug: string; name: string } | null;
  author: string | null;
  reviewedBy: string | null;
  reviewedOn: string | null;
  publishedOn: string | null;
  updatedOn: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

function toPublicArticle(
  a: SnapshotArticle & { kind: ArticleKind },
  categories: Map<string, string>,
  publicBase: string | undefined,
): PublicArticle {
  return {
    slug: a.slug,
    kind: a.kind,
    path: articlePath(a.kind, a.slug),
    title: a.title,
    excerpt: a.excerpt,
    body: a.body,
    cover: (a.coverImage && toPublicImage(snapshotImageInput(a.coverImage), publicBase)) || null,
    bodyImages: Object.fromEntries(
      Object.entries(a.bodyImages ?? {}).flatMap(([id, image]) => {
        const photo = toPublicImageOrUndefined(image);
        return photo ? [[id, photo] as const] : [];
      }),
    ),
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
  };
}

/** Published articles that pass `keep`, newest first (the snapshot order). */
async function listArticles(keep: (a: SnapshotArticle) => boolean): Promise<PublicArticle[]> {
  const snapshot = await loadSnapshot();
  const publicBase = setting('R2_PUBLIC_BASE_URL');
  const categories = new Map((snapshot?.articleCategories ?? []).map((c) => [c.slug, c.name]));
  return (snapshot?.articles ?? [])
    .filter((a): a is SnapshotArticle & { kind: ArticleKind } => isArticleKind(a.kind) && keep(a))
    .map((a) => toPublicArticle(a, categories, publicBase));
}

/**
 * Published articles of one kind, newest first. Empty before the first publish that includes articles: there
 * is no sample article content, so pages that list articles show their sample cards (Home) or an empty state.
 */
export async function getArticles(kind: ArticleKind): Promise<PublicArticle[]> {
  return listArticles((a) => a.kind === kind);
}

/**
 * The articles ticked "Show on the service pages" (either kind), newest first: one list for every service page,
 * shown under the FAQ. Empty (no button) until such an article is published.
 */
export async function getServicePageArticles(): Promise<PublicArticle[]> {
  return listArticles((a) => a.onServicePages === true);
}

/** Categories of one kind that are shown, in display order (each has its own list page). */
export async function getArticleCategories(
  kind: ArticleKind,
): Promise<{ slug: string; name: string; description: string | null }[]> {
  const snapshot = await loadSnapshot();
  return (snapshot?.articleCategories ?? [])
    .filter((c) => c.kind === kind)
    .map((c) => ({ slug: c.slug, name: c.name, description: c.description ?? null }));
}

/** True before the first publish (or without database credentials): pages then use the built-in sample content. */
export async function isSampleContent(): Promise<boolean> {
  return (await loadSnapshot()) === null;
}
