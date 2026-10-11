import type { ArticleKind } from '../lib/cms/articles';

// Text of the two article list pages (Travel Guide and Dental Knowledge). Titles and intros are the website's own
// words, not article content. The page title and description can be changed in the admin (Pages (SEO)).
export interface ArticleListText {
  /** First folder of the address: /travel-guide */
  segment: string;
  /** Small label above the hero title and the breadcrumb name. */
  label: string;
  heading: string;
  intro: string;
  seoTitle: string;
  seoDescription: string;
}

export const ARTICLE_LISTS: Record<ArticleKind, ArticleListText> = {
  travel_guide: {
    segment: 'travel-guide',
    label: 'Dental travel guide',
    // Figma "Dental Travel Guide". The intro line is not in Figma (it repeats the Services text there).
    heading: 'Discover Beautiful Vietnam.',
    intro:
      'Practical tips and places to explore when you plan a trip around your dental treatment in Vietnam.',
    seoTitle: 'Dental travel guide · Melatec Dental Clinic',
    seoDescription:
      'Practical tips and places to explore when you plan a trip around your dental treatment in Vietnam.',
  },
  dental_knowledge: {
    segment: 'dental-knowledge',
    label: 'Dental knowledge',
    // Figma "Dental Knowledge". The intro line is not in Figma (it repeats the Services text there).
    heading: 'Trusted Knowledge for a Healthier Smile',
    intro:
      'Clear answers about dental treatments, each reviewed by our dental team, to help you decide with confidence.',
    seoTitle: 'Dental knowledge · Melatec Dental Clinic',
    seoDescription: 'Clear answers about dental treatments, reviewed by the Melatec dental team.',
  },
};

export const ARTICLE_SEGMENTS = Object.entries(ARTICLE_LISTS).map(
  ([kind, list]) => [list.segment, kind as ArticleKind] as const,
);

export const kindFromSegment = (segment: string | undefined): ArticleKind | null =>
  ARTICLE_SEGMENTS.find(([s]) => s === segment)?.[1] ?? null;
