import {
  footerExplore as sampleExplore,
  footerLegal as sampleLegal,
  footerTreatments as sampleTreatments,
  mainNav as sampleMain,
  site as sample,
  utilityLink as sampleUtility,
  type NavLink,
} from '../data/site';
import { loadSnapshot } from './content';

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
  social: { platform: string; name: string; href: string }[];
  utility: NavLink | null;
  main: NavLink[];
  footerTreatments: NavLink[];
  footerExplore: NavLink[];
  footerLegal: NavLink[];
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

  return {
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
      : Object.entries(PLATFORM_NAMES).map(([platform, name]) => ({ platform, name, href: '#' })), // PLACEHOLDER
    utility: nav ? (at('utility')[0] ?? null) : sampleUtility,
    main: nav ? at('header') : sampleMain,
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
