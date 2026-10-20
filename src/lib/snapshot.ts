import type { AdminDb } from './admin-auth';
import { readColor } from './image-color.ts';
import { toFocus } from './image-slots.ts';
import { articleProblems, bodyImageIds, parseArticleBody } from './cms/articles.ts';
import { itemInput, parseFields } from './cms/fields.ts';
import {
  REQUIRED_SECTIONS,
  sectionByKey,
  sectionShown,
  upgradeSectionData,
  type SectionDef,
} from './cms/sections.ts';
import { parseVideoUrl } from './video-embed.ts';
import { STORY_PICTURE_ERROR } from './cms/smile-stories.ts';

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
  /** Part of the picture to keep in view when it is cropped; absent: the place's default. */
  focus?: { x: number; y: number };
  /** Average colour ('#rrggbb') shown behind the picture while it loads; absent for transparent pictures. */
  color?: string;
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
  /** Main menu only: the drop-down the link is in. Only present when set (older snapshots keep their hash). */
  group?: string;
}

export interface SnapshotFaq {
  group: string;
  question: string;
  answer: string;
}

/** A published legal page (Privacy Policy, Legal Disclaimer): only pages that are shown and have text. */
export interface SnapshotLegalPage {
  slug: string;
  title: string;
  /** Text in the format described in src/lib/cms/articles.ts; rendered as escaped data, never as HTML. */
  body: string;
  seoDescription: string | null;
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
  /** A YouTube or Vimeo address for the Home page video (normalised watch address); absent when none is set. */
  videoUrl?: string;
}

export interface SnapshotPage {
  path: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  noindex: boolean;
  /** Picture for link previews when the page is shared; absent: the default share picture. */
  shareImage?: SnapshotImage;
  /** The banner picture at the top of the page; absent: the built-in picture. */
  heroImage?: SnapshotImage;
}

/** A treatment of a service (a price card on the service's page and, when `home`, on the Home page). */
export interface SnapshotServiceOption {
  title: string;
  subtitle: string | null;
  /** Shown as written (for example "From $400 per tooth"); null: no price is shown. */
  priceText: string | null;
  inclusions: string[];
  home: boolean;
}

/**
 * A card of "Which treatment fits your situation" on a service's page. (Revisions published before 2026-10-17
 * evening may carry a picture pair per card; it is ignored: the pair is now the service's `situationsImages`.)
 */
export interface SnapshotSituation {
  tag: string | null;
  title: string;
  description: string | null;
}

/** A service: a group of treatments with a page of its own. */
export interface SnapshotService {
  slug: string;
  title: string;
  summary: string | null;
  image: SnapshotImage | null;
  // Absent in revisions published before the treatments existed (their services carried a price and
  // "what is included" lines of their own, no longer shown).
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  /** The shown treatments, in order. */
  options?: SnapshotServiceOption[];
  /** The wide picture at the top of the service's page; absent: the default banner. */
  banner?: SnapshotImage;
  /** The shown situation cards, in order; absent when there are none. */
  situations?: SnapshotSituation[];
  /** The small heading above the situations; absent: the heading of Page text. */
  situationsLabel?: string;
  /**
   * The before/after pair beside the situation cards; only when both pictures are still usable.
   */
  situationsImages?: { before: SnapshotImage; after: SnapshotImage };
}

export interface SnapshotPackage {
  slug: string;
  kind: string;
  title: string;
  inclusions: string[];
  /** A reference price; null: the card shows no price. */
  price: { amount: number; currency: string } | null;
  priceConditions: string | null;
  /** What the price is for ("per person"); absent when not set. */
  priceUnit?: string;
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

/** A before/after pair of the service pages' results slider (Smile results). */
export interface SnapshotSmileResult {
  before: SnapshotImage;
  after: SnapshotImage;
}

/** A slide of the Home page's "Smile transformations" block (Smile stories). */
export interface SnapshotSmileStory {
  /** Text in the format of src/lib/cms/articles.ts (no pictures). */
  body: string;
  before: SnapshotImage;
  after: SnapshotImage;
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
  /** Shown on the category page; null: the page uses the text of the whole list. */
  description?: string | null;
}

export interface SnapshotArticle {
  slug: string;
  kind: string;
  title: string;
  excerpt: string | null;
  /** Text in the format described in src/lib/cms/articles.ts; rendered as escaped data, never as HTML. */
  body: string | null;
  coverImage: SnapshotImage | null;
  /** The pictures used in `body` (`![caption](media:<id>)`), by media id. A picture that is gone is missing here. */
  bodyImages?: Record<string, SnapshotImage>;
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
  /** Listed under the FAQ of every service page. Only present when true, so older revisions keep their hash. */
  onServicePages?: true;
}

export interface Snapshot {
  site?: SnapshotSite;
  navigation?: SnapshotNavItem[];
  pages?: SnapshotPage[];
  doctors?: SnapshotDoctor[];
  faqs?: SnapshotFaq[];
  redirects?: SnapshotRedirect[];
  legalPages?: SnapshotLegalPage[];
  locations?: SnapshotLocation[];
  services?: SnapshotService[];
  packages?: SnapshotPackage[];
  sections?: SnapshotSection[];
  destinations?: SnapshotDestination[];
  articleCategories?: SnapshotArticleCategory[];
  articles?: SnapshotArticle[];
  smileResults?: SnapshotSmileResult[];
  smileStories?: SnapshotSmileStory[];
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
  focal_x: number | null;
  focal_y: number | null;
  dominant_color: string | null;
  status: string;
} | null;

/** Columns to embed for an image relation, e.g. `image:media_assets(${IMAGE_COLUMNS})`. */
export const IMAGE_COLUMNS =
  'r2_key, width, height, alt_text, is_decorative, variant_widths, focal_x, focal_y, dominant_color, status';

export function toSnapshotImage(row: ImageRow): SnapshotImage | null {
  if (!row || row.status !== 'active' || !row.width || !row.height) return null;
  const focus = toFocus(row.focal_x, row.focal_y);
  const color = readColor(row.dominant_color);
  return {
    key: row.r2_key,
    width: row.width,
    height: row.height,
    alt: row.alt_text,
    decorative: row.is_decorative,
    widths: row.variant_widths,
    // Only when chosen, so snapshots of pictures without one stay exactly as they were.
    ...(focus ? { focus } : {}),
    ...(color ? { color } : {}),
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
    const embed = parseVideoUrl(site.intro_video_url);
    if (embed) snapshot.site.videoUrl = embed.watchUrl;
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
    .select('location, label, href, menu_group')
    .eq('is_visible', true)
    .order('location')
    .order('sort_order')
    .order('label');
  if (navError) throw fail('menu links', navError);
  if (nav.length > 0)
    snapshot.navigation = nav.map(({ menu_group, ...link }) =>
      menu_group ? { ...link, group: menu_group } : link,
    );

  const { data: pages, error: pagesError } = await db
    .from('pages')
    .select(
      `path, title, seo_title, seo_description, noindex, share_image:media_assets!og_image_id(${IMAGE_COLUMNS}), hero_image:media_assets!hero_image_id(${IMAGE_COLUMNS})`,
    )
    .order('path');
  if (pagesError) throw fail('pages', pagesError);
  if (pages.length > 0) {
    snapshot.pages = pages.map((p) => {
      const shareImage = toSnapshotImage(p.share_image);
      const heroImage = toSnapshotImage(p.hero_image);
      return {
        path: p.path,
        title: p.title,
        seoTitle: p.seo_title,
        seoDescription: p.seo_description,
        noindex: p.noindex,
        // Only when chosen, so snapshots of earlier publishes keep their hash.
        ...(shareImage ? { shareImage } : {}),
        ...(heroImage ? { heroImage } : {}),
      };
    });
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
    .order('sort_order')
    .order('question');
  if (faqsError) throw fail('FAQs', faqsError);
  const answered = faqs.filter((f) => f.answer && f.answer.trim() !== '');
  if (answered.length > 0) {
    snapshot.faqs = answered.map((f) => ({
      group: f.group_key,
      question: f.question,
      answer: f.answer as string,
    }));
  }

  // A legal page without text is not published: the text has to come from the clinic.
  const { data: legal, error: legalError } = await db
    .from('legal_pages')
    .select('slug, title, body, seo_description')
    .eq('is_visible', true)
    .order('slug');
  if (legalError) throw fail('legal pages', legalError);
  const written = legal.filter((l) => l.body && l.body.trim() !== '');
  if (written.length > 0) {
    snapshot.legalPages = written.map((l) => ({
      slug: l.slug,
      title: l.title,
      body: l.body as string,
      seoDescription: l.seo_description,
    }));
  }

  // Only published (visible) articles, and only categories that are shown. A published article that breaks a
  // rule (see articleProblems) is still included here: snapshotProblems reports it and Publish stays blocked,
  // so nothing is dropped without anyone noticing.
  const { data: categories, error: categoriesError } = await db
    .from('article_categories')
    .select('slug, name, kind, description')
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
      `slug, kind, title, excerpt, body, category_id, show_on_service_pages, author_name, reviewed_by, reviewed_on, published_on, updated_at, seo_title, seo_description, cover:media_assets(${IMAGE_COLUMNS})`,
    )
    .eq('is_visible', true)
    .order('published_on', { ascending: false })
    .order('title');
  if (articlesError) throw fail('articles', articlesError);
  if (categories.length > 0) snapshot.articleCategories = categories;

  // Pictures placed in the article text. Looked up in small batches (D1 allows 100 parameters per statement).
  // A picture that was deleted or archived is simply not in the map; snapshotProblems reports it.
  const bodyImageRows = new Map<string, SnapshotImage>();
  const wantedImages = [
    ...new Set(articles.flatMap((a) => bodyImageIds(parseArticleBody(a.body)))),
  ];
  for (let i = 0; i < wantedImages.length; i += 80) {
    const { data: found, error: foundError } = await db
      .from('media_assets')
      .select(`id, ${IMAGE_COLUMNS}`)
      .eq('kind', 'image')
      .in('id', wantedImages.slice(i, i + 80));
    if (foundError) throw fail('article pictures', foundError);
    for (const row of found) {
      const image = toSnapshotImage(row);
      if (image) bodyImageRows.set(row.id, image);
    }
  }

  if (articles.length > 0) {
    snapshot.articles = articles.map((a) => {
      const category = a.category_id ? (categorySlugs.get(a.category_id) ?? null) : null;
      const bodyImages: Record<string, SnapshotImage> = {};
      for (const id of bodyImageIds(parseArticleBody(a.body))) {
        const image = bodyImageRows.get(id);
        if (image) bodyImages[id] = image;
      }
      return {
        slug: a.slug,
        kind: a.kind,
        title: a.title,
        excerpt: a.excerpt,
        body: a.body,
        coverImage: toSnapshotImage(a.cover),
        ...(Object.keys(bodyImages).length > 0 ? { bodyImages } : {}),
        // A hidden category is not offered as a filter, so its articles show as uncategorised.
        category: category && shownCategories.has(category) ? category : null,
        author: a.author_name,
        reviewedBy: a.reviewed_by,
        reviewedOn: a.reviewed_on,
        publishedOn: a.published_on,
        updatedOn: a.updated_at ? a.updated_at.slice(0, 10) : null,
        seoTitle: a.seo_title,
        seoDescription: a.seo_description,
        ...(a.show_on_service_pages ? { onServicePages: true as const } : {}),
      };
    });
  }

  const { data: services, error: servicesError } = await db
    .from('services')
    .select(
      `id, slug, title, summary, description, seo_title, seo_description, situations_label, image:media_assets!image_id(${IMAGE_COLUMNS}), banner:media_assets!banner_image_id(${IMAGE_COLUMNS}), situations_before:media_assets!situations_before_image_id(${IMAGE_COLUMNS}), situations_after:media_assets!situations_after_image_id(${IMAGE_COLUMNS})`,
    )
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (servicesError) throw fail('services', servicesError);
  const { data: options, error: optionsError } = await db
    .from('service_options')
    .select('service_id, title, subtitle, price_text, inclusions, show_on_home')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (optionsError) throw fail('service_options', optionsError);
  const { data: situationRows, error: situationsError } = await db
    .from('service_situations')
    .select('service_id, tag, title, description')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (situationsError) throw fail('service situations', situationsError);
  const situationsOf = (serviceId: string): SnapshotSituation[] =>
    situationRows
      .filter((r) => r.service_id === serviceId)
      .map((r) => ({ tag: r.tag, title: r.title, description: r.description }));
  if (services.length > 0) {
    snapshot.services = services.map((s) => {
      const banner = toSnapshotImage(s.banner);
      const situations = situationsOf(s.id);
      const situationsLabel = s.situations_label?.trim();
      // The pictures only when both are still usable.
      const before = toSnapshotImage(s.situations_before);
      const after = toSnapshotImage(s.situations_after);
      return {
        slug: s.slug,
        title: s.title,
        summary: s.summary,
        image: toSnapshotImage(s.image),
        // Only when chosen, so services without one keep the same shape (and hash) as before.
        ...(banner ? { banner } : {}),
        description: s.description,
        seoTitle: s.seo_title,
        seoDescription: s.seo_description,
        options: options
          .filter((o) => o.service_id === s.id)
          .map((o) => ({
            title: o.title,
            subtitle: o.subtitle,
            priceText: o.price_text,
            inclusions: o.inclusions,
            home: o.show_on_home,
          })),
        // Only when there is something, so services without them keep the same shape (and hash) as before.
        ...(situations.length > 0 ? { situations } : {}),
        ...(situationsLabel ? { situationsLabel } : {}),
        ...(before && after ? { situationsImages: { before, after } } : {}),
      };
    });
  }

  const { data: packages, error: packagesError } = await db
    .from('packages')
    .select(
      `slug, kind, title, inclusions, price_amount, currency, price_conditions, price_unit, service:services(slug), image:media_assets(${IMAGE_COLUMNS})`,
    )
    .eq('is_visible', true)
    .order('kind')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (packagesError) throw fail('packages', packagesError);
  if (packages.length > 0) {
    snapshot.packages = packages.map((p) => {
      const priceUnit = p.price_unit?.trim();
      return {
        slug: p.slug,
        kind: p.kind,
        title: p.title,
        inclusions: p.inclusions,
        price:
          p.price_amount !== null && p.currency
            ? { amount: p.price_amount, currency: p.currency }
            : null,
        priceConditions: p.price_conditions,
        // Only when set, so packages without one keep the same shape (and hash) as before.
        ...(priceUnit ? { priceUnit } : {}),
        service: p.service?.slug ?? null,
        image: toSnapshotImage(p.image),
      };
    });
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
      visible: sectionShown(def, r.is_visible),
      data: { ...upgradeSectionData(def.fields, r.data as Record<string, unknown>) },
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

  // Before/after pairs: only shown ones, and only when both pictures are still usable.
  const { data: results, error: resultsError } = await db
    .from('smile_results')
    .select(
      `before:media_assets!before_image_id(${IMAGE_COLUMNS}), after:media_assets!after_image_id(${IMAGE_COLUMNS})`,
    )
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (resultsError) throw fail('smile results', resultsError);
  const pairs: SnapshotSmileResult[] = [];
  for (const r of results) {
    const before = toSnapshotImage(r.before);
    const after = toSnapshotImage(r.after);
    if (before && after) pairs.push({ before, after });
  }
  if (pairs.length > 0) snapshot.smileResults = pairs;

  // Home slides: only shown ones, and only when both pictures are still usable. The admin name stays out.
  const { data: storyRows, error: storiesError } = await db
    .from('smile_stories')
    .select(
      `body, before:media_assets!before_image_id(${IMAGE_COLUMNS}), after:media_assets!after_image_id(${IMAGE_COLUMNS})`,
    )
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (storiesError) throw fail('smile stories', storiesError);
  const stories: SnapshotSmileStory[] = [];
  for (const r of storyRows) {
    const before = toSnapshotImage(r.before);
    const after = toSnapshotImage(r.after);
    if (before && after) stories.push({ body: r.body, before, after });
  }
  if (stories.length > 0) snapshot.smileStories = stories;

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
  // The Home smile block shows the published slides instead of its sample story once there are any.
  if (snapshot.smileStories?.length) have.add('home_smile');
  for (const key of REQUIRED_SECTIONS) {
    if (!have.has(key)) missing.push(`Page text: ${sectionByKey(key)?.label ?? key}`);
  }
  return missing;
}

/** The stored data of a section back through the same rules as the admin form. */
function sectionDataProblems(
  { fields, check }: Pick<SectionDef, 'fields' | 'check'>,
  data: Record<string, unknown>,
): string[] {
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
  if (!parsed.ok) return Object.values(parsed.errors);
  return Object.values(check?.(parsed.value) ?? {});
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
      slug: a.slug,
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
    for (const id of bodyImageIds(parseArticleBody(a.body))) {
      const image = a.bodyImages?.[id];
      if (!image) {
        problems.push(
          `Article “${a.title}”: a picture in the text is no longer in Media (deleted or archived). Choose another one or remove the line.`,
        );
      } else if (!image.decorative && !image.alt) {
        problems.push(
          `Article “${a.title}”: a picture in the text has no description. Add one in Media, or mark the image as decorative.`,
        );
      }
    }
    if (a.coverImage && !a.coverImage.decorative && !a.coverImage.alt) {
      problems.push(
        `Article “${a.title}”: the cover image has no description. Add one in Media, or mark the image as decorative.`,
      );
    }
  }
  for (const p of snapshot.pages ?? []) {
    if (p.heroImage && !p.heroImage.decorative && !p.heroImage.alt) {
      problems.push(
        `Page “${p.title}”: the banner picture has no description. Add one in Media, or mark the image as decorative.`,
      );
    }
  }
  for (const s of snapshot.services ?? []) {
    if (s.image && !s.image.decorative && !s.image.alt) {
      problems.push(
        `Service “${s.title}”: the photo has no description. Add one in Media, or mark the image as decorative.`,
      );
    }
    if (s.banner && !s.banner.decorative && !s.banner.alt) {
      problems.push(
        `Service “${s.title}”: the banner picture has no description. Add one in Media, or mark the image as decorative.`,
      );
    }
    for (const [side, image] of [
      ['before', s.situationsImages?.before],
      ['after', s.situationsImages?.after],
    ] as const) {
      if (image && !image.decorative && !image.alt) {
        problems.push(
          `Service “${s.title}”: the “Which treatment fits” ${side} picture has no description. Add one in Media.`,
        );
      }
    }
  }
  for (const section of snapshot.sections ?? []) {
    const def = sectionByKey(section.key);
    if (!def) continue;
    if (section.visible) {
      for (const message of sectionDataProblems(def, section.data)) {
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
  (snapshot.smileResults ?? []).forEach((pair, i) => {
    for (const [side, image] of [
      ['before', pair.before],
      ['after', pair.after],
    ] as const) {
      if (!image.decorative && !image.alt) {
        problems.push(
          `Service pages: smile results, pair ${i + 1}: the ${side} photo has no description. Add one in Media.`,
        );
      }
    }
  });
  (snapshot.smileStories ?? []).forEach((story, i) => {
    for (const [side, image] of [
      ['before', story.before],
      ['after', story.after],
    ] as const) {
      if (!image.decorative && !image.alt) {
        problems.push(
          `Home: smile stories, slide ${i + 1}: the ${side} photo has no description. Add one in Media.`,
        );
      }
    }
    if (bodyImageIds(parseArticleBody(story.body)).length > 0) {
      problems.push(`Home: smile stories, slide ${i + 1}: ${STORY_PICTURE_ERROR}`);
    }
  });
  for (const l of snapshot.legalPages ?? []) {
    if (bodyImageIds(parseArticleBody(l.body)).length > 0) {
      problems.push(
        `Legal page “${l.title}”: pictures are not used on legal pages. Remove them from the text.`,
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
      'legalPages',
      'locations',
      'services',
      'packages',
      'destinations',
      'sections',
      'articleCategories',
      'articles',
      'smileResults',
      'smileStories',
    ].every((k) => arrayOrMissing(value[k]))
  )
    return false;
  if (value.site !== undefined && !(isObject(value.site) && typeof value.site.name === 'string'))
    return false;
  const video = isObject(value.site) ? value.site.video : undefined;
  if (video !== undefined && video !== null && !(isObject(video) && typeof video.key === 'string'))
    return false;
  const videoUrl = isObject(value.site) ? value.site.videoUrl : undefined;
  if (videoUrl !== undefined && !(typeof videoUrl === 'string' && parseVideoUrl(videoUrl)))
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
        (isObject(a.coverImage) && typeof a.coverImage.key === 'string')) &&
      (a.bodyImages === undefined ||
        (isObject(a.bodyImages) &&
          Object.values(a.bodyImages).every((i) => isObject(i) && typeof i.key === 'string'))) &&
      (a.onServicePages === undefined || a.onServicePages === true),
  );
  if (!articlesValid) return false;
  const categories = (value.articleCategories ?? []) as unknown[];
  if (
    !categories.every(
      (c) => isObject(c) && typeof c.slug === 'string' && typeof c.name === 'string',
    )
  )
    return false;

  const pages = (value.pages ?? []) as unknown[];
  if (
    !pages.every(
      (p) =>
        isObject(p) &&
        typeof p.path === 'string' &&
        (p.heroImage === undefined ||
          (isObject(p.heroImage) && typeof p.heroImage.key === 'string')),
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
        (x.image === undefined ||
          x.image === null ||
          (isObject(x.image) && typeof x.image.key === 'string')) &&
        (x.banner === undefined || (isObject(x.banner) && typeof x.banner.key === 'string')) &&
        (x.options === undefined ||
          (Array.isArray(x.options) &&
            x.options.every(
              (o) =>
                isObject(o) &&
                typeof o.title === 'string' &&
                Array.isArray(o.inclusions) &&
                typeof o.home === 'boolean',
            ))) &&
        (x.situationsLabel === undefined || typeof x.situationsLabel === 'string') &&
        (x.situations === undefined ||
          (Array.isArray(x.situations) &&
            x.situations.every((i) => isObject(i) && typeof i.title === 'string'))) &&
        (x.situationsImages === undefined ||
          (isObject(x.situationsImages) &&
            isObject(x.situationsImages.before) &&
            typeof x.situationsImages.before.key === 'string' &&
            isObject(x.situationsImages.after) &&
            typeof x.situationsImages.after.key === 'string')),
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
        (x.priceUnit === undefined || typeof x.priceUnit === 'string') &&
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

  const isImage = (i: unknown) => isObject(i) && typeof i.key === 'string';
  const pairs = (value.smileResults ?? []) as unknown[];
  if (!pairs.every((p) => isObject(p) && isImage(p.before) && isImage(p.after))) return false;
  const stories = (value.smileStories ?? []) as unknown[];
  if (
    !stories.every(
      (p) => isObject(p) && typeof p.body === 'string' && isImage(p.before) && isImage(p.after),
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
