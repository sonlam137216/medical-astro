// Search and share metadata: absolute URLs and schema.org JSON-LD. Pure functions (no Astro, no I/O) so they are
// tested on their own; the layouts decide what to pass in. Nothing here invents facts: a field is written only
// when the caller has a real value for it.

declare const __SITE_INDEXABLE__: boolean | undefined;

/** True only for a build made with SITE_INDEXABLE=true and a SITE_URL (see integrations/build-env.mjs). */
export const SITE_INDEXABLE = typeof __SITE_INDEXABLE__ !== 'undefined' && __SITE_INDEXABLE__;

/** Picture shown when a page is shared and has no picture of its own (public/og-default.jpg, 1200×630). */
export const DEFAULT_SHARE_IMAGE = '/og-default.jpg';

type JsonLd = Record<string, unknown>;

/** `value` as an absolute URL under `site`; undefined when there is no site origin (nothing to resolve against). */
export function absoluteUrl(site: URL | string | undefined, value: string): string | undefined {
  if (/^https?:\/\//i.test(value)) return value;
  if (!site) return undefined;
  try {
    return new URL(value, site).href;
  } catch {
    return undefined;
  }
}

/**
 * The address of a page of this site, in the form the build serves it (a trailing slash, like the canonical
 * address): `/about` becomes `https://site/about/`. Files (`/robots.txt`) are left alone.
 */
export function pageUrl(site: URL | string | undefined, path: string): string | undefined {
  const withSlash = path.endsWith('/') || /\.[a-z0-9]+$/i.test(path) ? path : `${path}/`;
  return absoluteUrl(site, withSlash);
}

/** JSON for a `<script type="application/ld+json">`: `<` is escaped so no text can close the tag early. */
export function jsonLdString(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Drops undefined, null, empty strings and empty arrays so the output only holds what is known. */
function clean<T extends JsonLd>(data: T): T {
  const out: JsonLd = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as T;
}

export interface OrganizationInput {
  name: string;
  /** Home page URL. */
  url: string;
  logo?: string;
  image?: string;
  description?: string;
  phone?: string | null;
  email?: string | null;
  /** Profile links (only the ones that have an address). */
  sameAs?: (string | null)[];
  /** Clinics: a name and the address as one line of text. */
  locations?: { name: string; address: string }[];
}

/** The clinic as a business: schema.org `Dentist`. Branches become `Place`s with the address as text. */
export function organizationJsonLd(i: OrganizationInput): JsonLd {
  return clean({
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    name: i.name,
    url: i.url,
    logo: i.logo,
    image: i.image,
    description: i.description,
    telephone: i.phone ?? undefined,
    email: i.email ?? undefined,
    sameAs: (i.sameAs ?? []).filter((u): u is string => !!u),
    location: (i.locations ?? [])
      .filter((l) => l.address)
      .map((l) =>
        clean({
          '@type': 'Place',
          name: l.name,
          address: { '@type': 'PostalAddress', streetAddress: l.address },
        }),
      ),
  });
}

export interface ArticleInput {
  url: string;
  title: string;
  description?: string | null;
  image?: string;
  author?: string | null;
  publishedOn?: string | null;
  updatedOn?: string | null;
  reviewedBy?: string | null;
  reviewedOn?: string | null;
  publisher: { name: string; url: string; logo?: string };
}

/**
 * An article. When a clinician reviewed it (Dental Knowledge), it is also a `MedicalWebPage`, which is where
 * schema.org keeps `reviewedBy` and `lastReviewed`.
 */
export function articleJsonLd(i: ArticleInput): JsonLd {
  const reviewed = !!i.reviewedBy;
  return clean({
    '@context': 'https://schema.org',
    '@type': reviewed ? ['Article', 'MedicalWebPage'] : 'Article',
    mainEntityOfPage: i.url,
    headline: i.title,
    description: i.description ?? undefined,
    image: i.image,
    author: i.author ? { '@type': 'Person', name: i.author } : undefined,
    datePublished: i.publishedOn ?? undefined,
    dateModified: i.updatedOn ?? i.publishedOn ?? undefined,
    reviewedBy: i.reviewedBy ? { '@type': 'Person', name: i.reviewedBy } : undefined,
    lastReviewed: reviewed ? (i.reviewedOn ?? undefined) : undefined,
    publisher: clean({
      '@type': 'Organization',
      name: i.publisher.name,
      url: i.publisher.url,
      logo: i.publisher.logo ? { '@type': 'ImageObject', url: i.publisher.logo } : undefined,
    }),
  });
}

/** Question and answer pairs. Returns null when none has an answer: unanswered questions are never listed. */
export function faqJsonLd(items: { question: string; answer: string | null }[]): JsonLd | null {
  const answered = items.filter((f) => f.answer && f.answer.trim() !== '');
  if (answered.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: answered.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

/** A breadcrumb trail; the last item is the page itself and needs no link. */
export function breadcrumbJsonLd(items: { name: string; url?: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) =>
      clean({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url }),
    ),
  };
}
