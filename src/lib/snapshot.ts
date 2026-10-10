import type { AdminDb } from './admin-auth';
import { articleProblems } from './cms/articles.ts';
import { itemInput, parseFields, type Field } from './cms/fields.ts';
import { REQUIRED_SECTIONS, sectionByKey } from './cms/sections.ts';

// What the public site is built from. A snapshot is a complete copy of the published content; the build
// reads one snapshot (never the working-copy tables), so a half-edited draft cannot leak into a build.
//
// Every section is optional. A section is included only once the working copy has real content for it;
// a section that is missing makes the public pages use the built-in sample content from src/data (so
// publishing one section never blanks the others). Adding optional sections is not a breaking change;
// bump SNAPSHOT_SCHEMA_VERSION only when an existing shape changes incompatibly.
export const SNAPSHOT_SCHEMA_VERSION = 1;

/** An image as the build needs it: enough to build URLs and a `srcset`, plus the text alternative. */
export interface SnapshotImage {
  key: string;
  width: number;
  height: number;
  /** Null only for decorative images. */
  alt: string | null;
  decorative: boolean;
  widths: number[];
}

export interface SnapshotDoctor {
  slug: string;
  name: string;
  role: string | null;
  bio: string | null;
  credentials: string[];
  languages: string[];
  image: SnapshotImage | null;
}

export interface SnapshotNavItem {
  location: string;
  label: string;
  href: string;
}

export interface SnapshotFaq {
  group: string;
  question: string;
  answer: string;
}

export interface SnapshotRedirect {
  from: string;
  to: string;
  status: 301 | 302;
}

/** The Home page video: one MP4 file plus its cover image. */
export interface SnapshotVideo {
  key: string;
  width: number | null;
  height: number | null;
  /** Description of the video (required when it is uploaded). */
  title: string | null;
  poster: SnapshotImage | null;
}

export interface SnapshotSite {
  name: string;
  tagline: string | null;
  phoneDisplay: string | null;
  phoneIntl: string | null;
  whatsappUrl: string | null;
  email: string | null;
  addressLine: string | null;
  hours: string | null;
  copyright: string | null;
  social: { platform: string; url: string }[];
  /** The video of the Home page; absent when none is chosen. */
  video?: SnapshotVideo | null;
}

export interface SnapshotPage {
  path: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  noindex: boolean;
}

export interface SnapshotService {
  slug: string;
  title: string;
  summary: string | null;
  inclusions: string[];
  /** Shown as written (for example "From $600"); null: no price is shown. */
  priceText: string | null;
  image: SnapshotImage | null;
}

export interface SnapshotPackage {
  slug: string;
  kind: string;
  title: string;
  inclusions: string[];
  /** A reference price; null: the card shows no price. */
  price: { amount: number; currency: string } | null;
  priceConditions: string | null;
  /** Slug of the related service, if one is chosen. */
  service: string | null;
  image: SnapshotImage | null;
}

export interface SnapshotDestination {
  slug: string;
  name: string;
  summary: string | null;
  image: SnapshotImage | null;
}

/** The edited text of one page section (see src/lib/cms/sections.ts); `images` holds its photos, by field name. */
export interface SnapshotSection {
  key: string;
  /** False: the section is switched off and the page leaves it out. */
  visible: boolean;
  data: Record<string, unknown>;
  images?: Record<string, SnapshotImage>;
}

export interface SnapshotLocation {
  slug: string;
  name: string;
  address: string | null;
  /** A link to a map; null: the build links to a map search for the address. */
  directionsUrl: string | null;
  image: SnapshotImage | null;
}

export interface SnapshotArticleCategory {
  slug: string;
  name: string;
  kind: string;
}

export interface SnapshotArticle {
  slug: string;
  kind: string;
  title: string;
  excerpt: string | null;
  /** Text in the format described in src/lib/cms/articles.ts; rendered as escaped data, never as HTML. */
  body: string | null;
  coverImage: SnapshotImage | null;
  /** Slug of an entry of `articleCategories`. */
  category: string | null;
  author: string | null;
  reviewedBy: string | null;
  reviewedOn: string | null;
  publishedOn: string | null;
  /** Date of the last edit (YYYY-MM-DD). */
  updatedOn: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface Snapshot {
  site?: SnapshotSite;
  navigation?: SnapshotNavItem[];
  pages?: SnapshotPage[];
  doctors?: SnapshotDoctor[];
  faqs?: SnapshotFaq[];
  redirects?: SnapshotRedirect[];
  locations?: SnapshotLocation[];
  services?: SnapshotService[];
  packages?: SnapshotPackage[];
  sections?: SnapshotSection[];
  destinations?: SnapshotDestination[];
  articleCategories?: SnapshotArticleCategory[];
  articles?: SnapshotArticle[];
}

/** Sections the website cannot go live without: the sample versions are placeholders from the design. */
export const REQUIRED_FOR_PRODUCTION: { key: keyof Snapshot; label: string }[] = [
  { key: 'site', label: 'Site details (name, phone, address)' },
  { key: 'navigation', label: 'Menu links' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'locations', label: 'Locations (clinic names and addresses)' },
  { key: 'services', label: 'Services' },
  { key: 'packages', label: 'Packages (price cards)' },
  { key: 'destinations', label: 'Travel destinations' },
];

type ImageRow = {
  r2_key: string;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  is_decorative: boolean;
  variant_widths: number[];
  status: string;
} | null;

/** Columns to embed for an image relation, e.g. `image:media_assets(${IMAGE_COLUMNS})`. */
export const IMAGE_COLUMNS =
  'r2_key, width, height, alt_text, is_decorative, variant_widths, status';

export function toSnapshotImage(row: ImageRow): SnapshotImage | null {
  if (!row || row.status !== 'active' || !row.width || !row.height) return null;
  return {
    key: row.r2_key,
    width: row.width,
    height: row.height,
    alt: row.alt_text,
    decorative: row.is_decorative,
    widths: row.variant_widths,
  };
}

const fail = (what: string, error: { code?: string }) =>
  new Error(`snapshot: could not read ${what} (${error.code ?? 'error'})`);

/** Working copy -> snapshot. Only visible items, in display order; empty sections are left out. */
export async function buildSnapshot(db: AdminDb): Promise<Snapshot> {
  const snapshot: Snapshot = {};

  const { data: site, error: siteError } = await db.from('site_settings').select('*').maybeSingle();
  if (siteError) throw fail('site settings', siteError);
  if (site) {
    snapshot.site = {
      name: site.site_name,
      tagline: site.tagline,
      phoneDisplay: site.phone_display,
      phoneIntl: site.phone_intl,
      whatsappUrl: site.whatsapp_url,
      email: site.contact_email,
      addressLine: site.address_line,
      hours: site.opening_hours,
      copyright: site.copyright_text,
      social: Array.isArray(site.social_links)
        ? (site.social_links as { platform?: unknown; url?: unknown }[])
            .filter((s) => typeof s.platform === 'string' && typeof s.url === 'string')
            .map((s) => ({ platform: s.platform as string, url: s.url as string }))
        : [],
    };
    if (site.intro_video_id) {
      const { data: video, error: videoError } = await db
        .from('media_assets')
        .select('r2_key, width, height, alt_text, status, poster_asset_id')
        .eq('id', site.intro_video_id)
        .eq('kind', 'video')
        .maybeSingle();
      if (videoError) throw fail('the Home page video', videoError);
      if (video && video.status === 'active') {
        let poster: SnapshotImage | null = null;
        if (video.poster_asset_id) {
          const { data: cover, error: coverError } = await db
            .from('media_assets')
            .select(IMAGE_COLUMNS)
            .eq('id', video.poster_asset_id)
            .maybeSingle();
          if (coverError) throw fail('the video cover image', coverError);
          poster = toSnapshotImage(cover);
        }
        snapshot.site.video = {
          key: video.r2_key,
          width: video.width,
          height: video.height,
          title: video.alt_text,
          poster,
        };
      }
    }
  }

  const { data: nav, error: navError } = await db
    .from('navigation_items')
    .select('location, label, href')
    .eq('is_visible', true)
    .order('location')
    .order('sort_order')
    .order('label');
  if (navError) throw fail('menu links', navError);
  if (nav.length > 0) snapshot.navigation = nav;

  const { data: pages, error: pagesError } = await db
    .from('pages')
    .select('path, title, seo_title, seo_description, noindex')
    .order('path');
  if (pagesError) throw fail('pages', pagesError);
  if (pages.length > 0) {
    snapshot.pages = pages.map((p) => ({
      path: p.path,
      title: p.title,
      seoTitle: p.seo_title,
      seoDescription: p.seo_description,
      noindex: p.noindex,
    }));
  }

  const { data: doctors, error: doctorsError } = await db
    .from('doctors')
    .select(
      `slug, full_name, role_title, bio, credentials, languages, image:media_assets(${IMAGE_COLUMNS})`,
    )
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .order('full_name', { ascending: true });
  if (doctorsError) throw fail('doctors', doctorsError);
  if (doctors.length > 0) {
    snapshot.doctors = doctors.map((d) => ({
      slug: d.slug,
      name: d.full_name,
      role: d.role_title,
      bio: d.bio,
      credentials: d.credentials,
      languages: d.languages,
      image: toSnapshotImage(d.image),
    }));
  }

  // A question without an answer is not published: answers about treatment must come from the clinic.
  const { data: faqs, error: faqsError } = await db
    .from('faqs')
    .select('group_key, question, answer')
    .eq('is_visible', true)
    .not('answer', 'is', null)
    .order('group_key')
    .order('sort_order');
  if (faqsError) throw fail('FAQs', faqsError);
  const answered = faqs.filter((f) => f.answer && f.answer.trim() !== '');
  if (answered.length > 0) {
    snapshot.faqs = answered.map((f) => ({
      group: f.group_key,
      question: f.question,
      answer: f.answer as string,
    }));
  }

  // Only published (visible) articles, and only categories that are shown. A published article that breaks a
  // rule (see articleProblems) is still included here: snapshotProblems reports it and Publish stays blocked,
  // so nothing is dropped without anyone noticing.
  const { data: categories, error: categoriesError } = await db
    .from('article_categories')
    .select('slug, name, kind')
    .eq('is_visible', true)
    .order('kind')
    .order('sort_order')
    .order('name');
  if (categoriesError) throw fail('article categories', categoriesError);
  const categorySlugs = new Map<string, string>();
  const { data: allCategories, error: allCategoriesError } = await db
    .from('article_categories')
    .select('id, slug');
  if (allCategoriesError) throw fail('article categories', allCategoriesError);
  for (const c of allCategories) categorySlugs.set(c.id, c.slug);
  const shownCategories = new Set(categories.map((c) => c.slug));

  const { data: articles, error: articlesError } = await db
    .from('articles')
    .select(
      `slug, kind, title, excerpt, body, category_id, author_name, reviewed_by, reviewed_on, published_on, updated_at, seo_title, seo_description, cover:media_assets(${IMAGE_COLUMNS})`,
    )
    .eq('is_visible', true)
    .order('published_on', { ascending: false })
    .order('title');
  if (articlesError) throw fail('articles', articlesError);
  if (categories.length > 0) snapshot.articleCategories = categories;
  if (articles.length > 0) {
    snapshot.articles = articles.map((a) => {
      const category = a.category_id ? (categorySlugs.get(a.category_id) ?? null) : null;
      return {
        slug: a.slug,
        kind: a.kind,
        title: a.title,
        excerpt: a.excerpt,
        body: a.body,
        coverImage: toSnapshotImage(a.cover),
        // A hidden category is not offered as a filter, so its articles show as uncategorised.
        category: category && shownCategories.has(category) ? category : null,
        author: a.author_name,
        reviewedBy: a.reviewed_by,
        reviewedOn: a.reviewed_on,
        publishedOn: a.published_on,
        updatedOn: a.updated_at ? a.updated_at.slice(0, 10) : null,
        seoTitle: a.seo_title,
        seoDescription: a.seo_description,
      };
    });
  }

  const { data: services, error: servicesError } = await db
    .from('services')
    .select(`slug, title, summary, inclusions, price_text, image:media_assets(${IMAGE_COLUMNS})`)
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (servicesError) throw fail('services', servicesError);
  if (services.length > 0) {
    snapshot.services = services.map((s) => ({
      slug: s.slug,
      title: s.title,
      summary: s.summary,
      inclusions: s.inclusions,
      priceText: s.price_text,
      image: toSnapshotImage(s.image),
    }));
  }

  const { data: packages, error: packagesError } = await db
    .from('packages')
    .select(
      `slug, kind, title, inclusions, price_amount, currency, price_conditions, service:services(slug), image:media_assets(${IMAGE_COLUMNS})`,
    )
    .eq('is_visible', true)
    .order('kind')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (packagesError) throw fail('packages', packagesError);
  if (packages.length > 0) {
    snapshot.packages = packages.map((p) => ({
      slug: p.slug,
      kind: p.kind,
      title: p.title,
      inclusions: p.inclusions,
      price:
        p.price_amount !== null && p.currency
          ? { amount: p.price_amount, currency: p.currency }
          : null,
      priceConditions: p.price_conditions,
      service: p.service?.slug ?? null,
      image: toSnapshotImage(p.image),
    }));
  }

  const { data: destinations, error: destinationsError } = await db
    .from('destinations')
    .select(`slug, name, summary, image:media_assets(${IMAGE_COLUMNS})`)
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (destinationsError) throw fail('travel destinations', destinationsError);
  if (destinations.length > 0) {
    snapshot.destinations = destinations.map((d) => ({
      slug: d.slug,
      name: d.name,
      summary: d.summary,
      image: toSnapshotImage(d.image),
    }));
  }

  // Page text. A row for a type the code no longer knows is left out; photos are looked up here so the build
  // needs nothing but the snapshot.
  const { data: sectionRows, error: sectionsError } = await db
    .from('page_sections')
    .select('type, is_visible, data')
    .order('type');
  if (sectionsError) throw fail('page text', sectionsError);
  const sections: SnapshotSection[] = [];
  for (const r of sectionRows) {
    const def = sectionByKey(r.type);
    if (!def) continue;
    const entry: SnapshotSection = {
      key: r.type,
      visible: r.is_visible,
      data: { ...(r.data as Record<string, unknown>) },
    };
    for (const f of def.fields) {
      if (f.type !== 'image') continue;
      const id = entry.data[f.name];
      delete entry.data[f.name];
      if (typeof id !== 'string' || id === '') continue;
      const { data: asset, error: assetError } = await db
        .from('media_assets')
        .select(IMAGE_COLUMNS)
        .eq('id', id)
        .eq('kind', 'image')
        .maybeSingle();
      if (assetError) throw fail('a page text photo', assetError);
      const image = toSnapshotImage(asset);
      if (image) (entry.images ??= {})[f.name] = image;
    }
    sections.push(entry);
  }
  if (sections.length > 0) snapshot.sections = sections;

  const { data: locations, error: locationsError } = await db
    .from('locations')
    .select(`slug, name, address_line, directions_url, image:media_assets(${IMAGE_COLUMNS})`)
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (locationsError) throw fail('locations', locationsError);
  if (locations.length > 0) {
    snapshot.locations = locations.map((l) => ({
      slug: l.slug,
      name: l.name,
      address: l.address_line,
      directionsUrl: l.directions_url,
      image: toSnapshotImage(l.image),
    }));
  }

  const { data: redirects, error: redirectsError } = await db
    .from('redirects')
    .select('from_path, to_path, status_code')
    .order('from_path');
  if (redirectsError) throw fail('redirects', redirectsError);
  if (redirects.length > 0) {
    snapshot.redirects = redirects.map((r) => ({
      from: r.from_path,
      to: r.to_path,
      status: r.status_code === 302 ? 302 : 301,
    }));
  }

  return snapshot;
}

/** Sections a production build would still fill with sample content from the design. */
export function sampleSections(snapshot: Snapshot): string[] {
  const missing = REQUIRED_FOR_PRODUCTION.filter((s) => snapshot[s.key] === undefined).map(
    (s) => s.label,
  );
  const have = new Set((snapshot.sections ?? []).map((s) => s.key));
  for (const key of REQUIRED_SECTIONS) {
    if (!have.has(key)) missing.push(`Page text: ${sectionByKey(key)?.label ?? key}`);
  }
  return missing;
}

/** The stored data of a section back through the same rules as the admin form. */
function sectionDataProblems(fields: readonly Field[], data: Record<string, unknown>): string[] {
  const form = new URLSearchParams();
  for (const f of fields) {
    const v = data[f.name];
    if (f.type === 'lines' && Array.isArray(v)) form.set(f.name, v.join('\n'));
    else if (f.type === 'items' && Array.isArray(v)) {
      (v as Record<string, unknown>[]).slice(0, f.maxItems).forEach((item, i) => {
        for (const c of f.columns) {
          const cell = item?.[c.name];
          form.set(
            itemInput(f.name, i, c.name),
            Array.isArray(cell) ? cell.join('\n') : typeof cell === 'string' ? cell : '',
          );
        }
      });
    } else if (typeof v === 'string') form.set(f.name, v);
  }
  const parsed = parseFields(
    fields.filter((f) => f.type !== 'image'),
    form,
  );
  return parsed.ok ? [] : Object.values(parsed.errors);
}

/**
 * Things that must be fixed before this snapshot may be published (shown on the Publish page).
 * `target` is where the build deploys: production must not go out with design placeholders.
 */
export function snapshotProblems(snapshot: Snapshot, target: string = 'staging'): string[] {
  const problems: string[] = [];
  for (const d of snapshot.doctors ?? []) {
    if (d.image && !d.image.decorative && !d.image.alt) {
      problems.push(
        `${d.name}: the photo has no description. Add one in Media, or mark the image as decorative.`,
      );
    }
  }
  const video = snapshot.site?.video;
  if (video && !video.title?.trim()) {
    problems.push('Home page video: it has no description. Add one in Media.');
  }
  if (video?.poster && !video.poster.decorative && !video.poster.alt) {
    problems.push(
      'Home page video: the cover image has no description. Add one in Media, or mark the image as decorative.',
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const categoryKinds = new Map((snapshot.articleCategories ?? []).map((c) => [c.slug, c.kind]));
  for (const a of snapshot.articles ?? []) {
    const found = articleProblems({
      kind: a.kind,
      isVisible: true,
      title: a.title,
      excerpt: a.excerpt,
      body: a.body,
      publishedOn: a.publishedOn,
      reviewedBy: a.reviewedBy,
      categoryKind: a.category ? (categoryKinds.get(a.category) ?? null) : null,
      today,
    });
    for (const message of Object.values(found)) problems.push(`Article “${a.title}”: ${message}`);
    if (a.coverImage && !a.coverImage.decorative && !a.coverImage.alt) {
      problems.push(
        `Article “${a.title}”: the cover image has no description. Add one in Media, or mark the image as decorative.`,
      );
    }
  }
  for (const s of snapshot.services ?? []) {
    if (s.image && !s.image.decorative && !s.image.alt) {
      problems.push(
        `Service “${s.title}”: the photo has no description. Add one in Media, or mark the image as decorative.`,
      );
    }
  }
  for (const section of snapshot.sections ?? []) {
    const def = sectionByKey(section.key);
    if (!def) continue;
    if (section.visible) {
      for (const message of sectionDataProblems(def.fields, section.data)) {
        problems.push(`Page text “${def.label}”: ${message}`);
      }
    }
    for (const image of Object.values(section.images ?? {})) {
      if (!image.decorative && !image.alt) {
        problems.push(
          `Page text “${def.label}”: the photo has no description. Add one in Media, or mark the image as decorative.`,
        );
      }
    }
  }
  for (const p of snapshot.packages ?? []) {
    if (p.image && !p.image.decorative && !p.image.alt) {
      problems.push(
        `Package “${p.title}”: the photo has no description. Add one in Media, or mark the image as decorative.`,
      );
    }
  }
  for (const d of snapshot.destinations ?? []) {
    if (d.image && !d.image.decorative && !d.image.alt) {
      problems.push(
        `Destination “${d.name}”: the photo has no description. Add one in Media, or mark the image as decorative.`,
      );
    }
  }
  for (const l of snapshot.locations ?? []) {
    if (l.image && !l.image.decorative && !l.image.alt) {
      problems.push(
        `Location “${l.name}”: the photo has no description. Add one in Media, or mark the image as decorative.`,
      );
    }
  }
  for (const r of snapshot.redirects ?? []) {
    if (r.from === r.to) problems.push(`Redirect ${r.from} points to itself.`);
    if (!/^(\/|https?:\/\/)/.test(r.to)) {
      problems.push(
        `Redirect ${r.from}: the new address must be a page on this site (starting with /) or a full web address.`,
      );
    }
  }
  if (target === 'production') {
    for (const label of sampleSections(snapshot)) {
      problems.push(
        `${label}: still using sample content from the design. Add the real content first.`,
      );
    }
  }
  return problems;
}

/** SHA-256 hex of the snapshot. Objects are built with a fixed key order, so equal content gives equal hashes. */
export async function hashSnapshot(snapshot: Snapshot): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Runtime check for a snapshot read back from the database (it is jsonb, so not typed). */
export function isSnapshot(value: unknown): value is Snapshot {
  if (!isObject(value) || Array.isArray(value)) return false;
  const arrayOrMissing = (v: unknown) => v === undefined || Array.isArray(v);
  if (
    ![
      'navigation',
      'pages',
      'doctors',
      'faqs',
      'redirects',
      'locations',
      'services',
      'packages',
      'destinations',
      'sections',
      'articleCategories',
      'articles',
    ].every((k) => arrayOrMissing(value[k]))
  )
    return false;
  if (value.site !== undefined && !(isObject(value.site) && typeof value.site.name === 'string'))
    return false;
  const video = isObject(value.site) ? value.site.video : undefined;
  if (video !== undefined && video !== null && !(isObject(video) && typeof video.key === 'string'))
    return false;

  const articles = (value.articles ?? []) as unknown[];
  const articlesValid = articles.every(
    (a) =>
      isObject(a) &&
      typeof a.slug === 'string' &&
      typeof a.kind === 'string' &&
      typeof a.title === 'string' &&
      (a.coverImage === undefined ||
        a.coverImage === null ||
        (isObject(a.coverImage) && typeof a.coverImage.key === 'string')),
  );
  if (!articlesValid) return false;
  const categories = (value.articleCategories ?? []) as unknown[];
  if (
    !categories.every(
      (c) => isObject(c) && typeof c.slug === 'string' && typeof c.name === 'string',
    )
  )
    return false;

  const services = (value.services ?? []) as unknown[];
  if (
    !services.every(
      (x) =>
        isObject(x) &&
        typeof x.slug === 'string' &&
        typeof x.title === 'string' &&
        Array.isArray(x.inclusions) &&
        (x.image === undefined ||
          x.image === null ||
          (isObject(x.image) && typeof x.image.key === 'string')),
    )
  )
    return false;

  const sections = (value.sections ?? []) as unknown[];
  if (
    !sections.every(
      (x) =>
        isObject(x) &&
        typeof x.key === 'string' &&
        typeof x.visible === 'boolean' &&
        isObject(x.data) &&
        (x.images === undefined ||
          (isObject(x.images) &&
            Object.values(x.images).every((i) => isObject(i) && typeof i.key === 'string'))),
    )
  )
    return false;
  const hasImage = (x: Record<string, unknown>) =>
    x.image === undefined ||
    x.image === null ||
    (isObject(x.image) && typeof x.image.key === 'string');
  const packages = (value.packages ?? []) as unknown[];
  if (
    !packages.every(
      (x) =>
        isObject(x) &&
        typeof x.slug === 'string' &&
        typeof x.kind === 'string' &&
        typeof x.title === 'string' &&
        Array.isArray(x.inclusions) &&
        (x.price === null ||
          (isObject(x.price) &&
            typeof x.price.amount === 'number' &&
            typeof x.price.currency === 'string')) &&
        hasImage(x),
    )
  )
    return false;
  const destinations = (value.destinations ?? []) as unknown[];
  if (
    !destinations.every(
      (x) => isObject(x) && typeof x.slug === 'string' && typeof x.name === 'string' && hasImage(x),
    )
  )
    return false;

  const locations = (value.locations ?? []) as unknown[];
  if (
    !locations.every(
      (l) =>
        isObject(l) &&
        typeof l.slug === 'string' &&
        typeof l.name === 'string' &&
        (l.image === undefined ||
          l.image === null ||
          (isObject(l.image) && typeof l.image.key === 'string')),
    )
  )
    return false;

  const doctors = (value.doctors ?? []) as unknown[];
  return doctors.every(
    (d) =>
      isObject(d) &&
      typeof d.slug === 'string' &&
      typeof d.name === 'string' &&
      Array.isArray(d.credentials) &&
      Array.isArray(d.languages) &&
      // Older revisions have no `image`.
      (d.image === undefined ||
        d.image === null ||
        (isObject(d.image) && typeof d.image.key === 'string')),
  );
}
