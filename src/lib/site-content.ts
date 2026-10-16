import {
  footerExplore as sampleExplore,
  footerLegal as sampleLegal,
  footerTreatments as sampleTreatments,
  mainNav as sampleMain,
  site as sample,
  utilityLink as sampleUtility,
  type NavLink,
} from '../data/site';
import { loadSnapshot, getPublicBase, getServices, getLocations } from './content';
import { DEFAULT_SHARE_IMAGE, absoluteUrl, largestImageUrl, organizationJsonLd } from './seo';
import {
  snapshotImageInput,
  toPublicImage,
  toPublicVideo,
  type PublicImage,
  type PublicVideo,
} from './media';
import { parseVideoUrl, type VideoEmbed } from './video-embed';
import { groupMenu, withServicesMenu, type MenuItem } from './menu';

// BUILD-TIME ONLY (see content.ts). Site-wide details and menus for the header, footer and contact blocks.
//
// With published content, an empty value means "not provided": components hide it. Sample values from the
// design are only used when nothing has been published for that part, never mixed in next to real ones
// (a sample phone number beside a real address would be worse than no phone number).

export interface SiteContent {
  name: string;
  tagline: string | null;
  phoneDisplay: string | null;
  phoneIntl: string | null;
  whatsappUrl: string | null;
  email: string | null;
  addressLine: string | null;
  hours: string | null;
  copyright: string | null;
  /** `href` is null before anything is published: the platform is shown without a link rather than a dead one. */
  social: { platform: string; name: string; href: string | null }[];
  utility: NavLink | null;
  /** The main menu: links, and drop-downs of links. */
  main: MenuItem[];
  footerTreatments: NavLink[];
  footerExplore: NavLink[];
  footerLegal: NavLink[];
  /** The Home page video, when one is published. Never a sample: with none, the video button and player are hidden. */
  video: PublicVideo | null;
  /** A YouTube or Vimeo video chosen in Site details; shown instead of `video` when both are set. */
  videoEmbed: VideoEmbed | null;
}

const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

export async function getSiteContent(): Promise<SiteContent> {
  const snapshot = await loadSnapshot();
  const s = snapshot?.site;
  const nav = snapshot?.navigation;
  const at = (location: string): NavLink[] =>
    (nav ?? []).filter((n) => n.location === location).map(({ label, href }) => ({ label, href }));

  const v = s?.video;
  const video = v
    ? toPublicVideo(
        {
          r2_key: v.key,
          width: v.width,
          height: v.height,
          alt_text: v.title,
          poster: v.poster && snapshotImageInput(v.poster),
        },
        getPublicBase(),
      )
    : null;

  return {
    video,
    videoEmbed: parseVideoUrl(s?.videoUrl),
    name: s?.name ?? sample.name,
    tagline: s ? s.tagline : sample.tagline,
    phoneDisplay: s ? s.phoneDisplay : sample.phoneDisplay,
    phoneIntl: s ? s.phoneIntl : sample.phoneIntl,
    whatsappUrl: s ? s.whatsappUrl : sample.whatsappUrl,
    email: s ? s.email : sample.email,
    addressLine: s ? s.addressLine : sample.addressLine,
    hours: s ? s.hours : sample.hours,
    copyright: s ? s.copyright : sample.copyright,
    social: s
      ? s.social.map((l) => ({
          platform: l.platform,
          name: PLATFORM_NAMES[l.platform] ?? l.platform,
          href: l.url,
        }))
      : Object.entries(PLATFORM_NAMES).map(([platform, name]) => ({ platform, name, href: null })), // PLACEHOLDER
    utility: nav ? (at('utility')[0] ?? null) : sampleUtility,
    main: withServicesMenu(
      nav ? groupMenu(nav.filter((n) => n.location === 'header')) : sampleMain,
      (await getServices()).map((s) => ({ label: s.title, href: s.href })),
    ),
    footerTreatments: nav ? at('footer_treatment') : sampleTreatments,
    footerExplore: nav ? at('footer_explore') : sampleExplore,
    footerLegal: nav ? at('footer_legal') : sampleLegal,
  };
}

/** Page title and description: the published SEO text for the page, or the built-in text. */
export async function getPageSeo(
  path: string,
  fallback: { title: string; description?: string },
): Promise<{ title: string; description?: string }> {
  const page = (await loadSnapshot())?.pages?.find((p) => p.path === path);
  return {
    title: page?.seoTitle || fallback.title,
    description: page?.seoDescription || fallback.description,
  };
}

/**
 * Search and share settings of one page from Pages (SEO): whether to keep it out of search engines, and the
 * picture for link previews. `path` is the page's address with or without a trailing slash.
 */
export async function getPageMeta(
  path: string,
): Promise<{ noindex: boolean; shareImage: string | null }> {
  const wanted = path.length > 1 ? path.replace(/\/$/, '') : path;
  const page = (await loadSnapshot())?.pages?.find((p) => p.path === wanted);
  const shareImage =
    page?.shareImage && toPublicImage(snapshotImageInput(page.shareImage), getPublicBase());
  return {
    noindex: page?.noindex ?? false,
    shareImage: shareImage ? largestImageUrl(shareImage) : null,
  };
}

/** The banner picture chosen for a page in Pages (`path` without a trailing slash), or null for the built-in one. */
export async function getPageBanner(path: string): Promise<PublicImage | null> {
  const page = (await loadSnapshot())?.pages?.find((p) => p.path === path);
  return (
    (page?.heroImage && toPublicImage(snapshotImageInput(page.heroImage), getPublicBase())) || null
  );
}

/** Services offered to visitors (consultation forms, article sidebar): the published services, or the samples. */
export async function getServiceLinks(): Promise<NavLink[]> {
  return (await getServices()).map((s) => ({ label: s.title, href: s.href }));
}

/**
 * schema.org data for the clinic (Home page): the site's name, contact details, social profiles and clinics.
 * `site` is the website's origin (`Astro.site`); without it there is nothing to point the URLs at.
 */
export async function getOrganizationJsonLd(
  site: URL | undefined,
  extra: { description?: string; logoPath?: string } = {},
): Promise<Record<string, unknown> | null> {
  if (!site) return null;
  const [content, locations] = await Promise.all([getSiteContent(), getLocations()]);
  return organizationJsonLd({
    name: content.name,
    url: new URL('/', site).href,
    logo: extra.logoPath ? absoluteUrl(site, extra.logoPath) : undefined,
    image: absoluteUrl(site, DEFAULT_SHARE_IMAGE),
    description: extra.description,
    phone: content.phoneIntl,
    email: content.email,
    sameAs: content.social.map((s) => s.href),
    locations: locations.map((l) => ({ name: l.name, address: l.address })),
  });
}
