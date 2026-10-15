// Articles (Travel Guide, Dental Knowledge): the body format and the rules a published article must meet.
// Pure code (no Worker APIs, no relative imports) so it runs in `node --test`, in the admin form and at build time.

export const ARTICLE_KINDS = [
  ['travel_guide', 'Travel guide'],
  ['dental_knowledge', 'Dental knowledge'],
] as const;
export type ArticleKind = (typeof ARTICLE_KINDS)[number][0];

export const isArticleKind = (v: unknown): v is ArticleKind =>
  ARTICLE_KINDS.some(([key]) => key === v);

/** Where the articles of each kind live on the website. The detail page is `<base>/<slug>`. */
export const ARTICLE_BASE_PATH: Record<ArticleKind, string> = {
  travel_guide: '/travel-guide',
  dental_knowledge: '/dental-knowledge',
};

export const articlePath = (kind: ArticleKind, slug: string) =>
  `${ARTICLE_BASE_PATH[kind]}/${slug}`;

/**
 * Words an article address (slug) cannot use: they are the folders of the list pages
 * (`/travel-guide/page/2`, `/travel-guide/category/<name>`), so an article with that slug would never be reached.
 */
export const RESERVED_ARTICLE_SLUGS = ['page', 'category', 'search'];

/**
 * The redirect to add when an already published article changes address (a new slug, or the other kind), so old
 * links keep working. Null when nothing moved, or the article was not live before or is not live after.
 */
export function movedArticleRedirect(
  before: { kind: string; slug: string; isVisible: boolean },
  after: { kind: string; slug: string; isVisible: boolean },
): { from: string; to: string } | null {
  // An article that is switched off in the same save has no new page to point to.
  if (
    !before.isVisible ||
    !after.isVisible ||
    !isArticleKind(before.kind) ||
    !isArticleKind(after.kind)
  )
    return null;
  const from = articlePath(before.kind, before.slug);
  const to = articlePath(after.kind, after.slug);
  return from === to ? null : { from, to };
}

// ---------------------------------------------------------------------------
// List pages: pagination and categories (WordPress-style archives, all built at build time)
// ---------------------------------------------------------------------------
export const ARTICLES_PER_PAGE = 9;

/** `/travel-guide`, `/travel-guide/page/2`; the same under a category folder. */
export const listPagePath = (base: string, page: number) =>
  page <= 1 ? base : `${base}/page/${page}`;

export const categoryBasePath = (kind: ArticleKind, categorySlug: string) =>
  `${ARTICLE_BASE_PATH[kind]}/category/${categorySlug}`;

export function paginate<T>(items: T[], page: number, size = ARTICLES_PER_PAGE) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  return { items: items.slice((current - 1) * size, current * size), page: current, totalPages };
}

/**
 * Articles worth reading next: the same kind and category first, then the same kind, then the other kind
 * (a travel article can point to a dental one and the other way round). The input is already newest first and
 * the sort is stable, so ties stay newest first.
 */
export function relatedArticles<
  T extends { slug: string; kind: string; category: { slug: string } | null },
>(current: T, all: T[], limit = 4): T[] {
  const score = (a: T) => {
    const sameKind = a.kind === current.kind;
    const sameCategory =
      sameKind && a.category !== null && a.category.slug === current.category?.slug;
    return (sameKind ? 2 : 0) + (sameCategory ? 1 : 0);
  };
  return all
    .filter((a) => !(a.slug === current.slug && a.kind === current.kind))
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

export const MAX_ARTICLE_BODY = 60_000;

// ---------------------------------------------------------------------------
// Body format
// ---------------------------------------------------------------------------
// The body is plain text with a few markers, so editors need no HTML and nothing they type can inject markup:
// the parser returns data and the page renders it as escaped text.
//
//   ## Heading          section heading (also listed in the table of contents)
//   ### Smaller heading
//   - item              bullet list (one item per line)
//   1. item             numbered list
//   > text              quote
//   **bold**            bold text
//   [text](https://…)   link (a page on this site starting with /, https://, http://, mailto: or tel:)
//   ![caption](media:<id>)   a picture from the Media library, alone on its line (the caption may be empty;
//                            the description for screen readers comes from the Media library)
//
// A blank line starts a new paragraph.

export interface Inline {
  text: string;
  bold?: boolean;
  /** Only ever a safe link target (see SAFE_HREF). */
  href?: string;
}

export type Block =
  | { type: 'heading'; level: 2 | 3; id: string; text: string }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; children: Inline[] }
  /** A picture of the media library; the page looks `id` up in the published images of the article. */
  | { type: 'image'; id: string; caption: string };

const IMAGE_LINE =
  /^!\[([^\]]{0,200})\]\(media:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)$/;
const SAFE_HREF = /^(\/|https:\/\/|http:\/\/|mailto:|tel:|#)[^\s]*$/i;
// The link target may hold one level of parentheses, e.g. https://example.com/page_(info).
const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else if (SAFE_HREF.test(m[3])) out.push({ text: m[2], href: m[3] });
    else out.push({ text: m[2] }); // an unsafe target (javascript:, data:, …) is dropped, the words stay
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

function headingId(text: string, used: Set<string>): string {
  const base =
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'section';
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

export function parseArticleBody(source: string | null | undefined): Block[] {
  const lines = (source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  const used = new Set<string>();
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }
    const image = IMAGE_LINE.exec(line);
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (image) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'image', id: image[2], caption: image[1].trim() });
    } else if (heading) {
      flushParagraph();
      flushList();
      // A single # is treated as a section heading: the page title already is the h1.
      const level = heading[1].length >= 3 ? 3 : 2;
      const text = heading[2].trim();
      blocks.push({ type: 'heading', level, id: headingId(text, used), text });
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1].trim());
    } else if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'quote', children: parseInline(quote[1]) });
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** The "Table of contents" entries: the section headings. */
export const tableOfContents = (blocks: Block[]) =>
  blocks.flatMap((b) =>
    b.type === 'heading' && b.level === 2 ? [{ id: b.id, text: b.text }] : [],
  );

/** The table of contents with its second level: each section heading and the smaller headings under it. */
export function tocOutline(blocks: Block[]) {
  const out: { id: string; text: string; children: { id: string; text: string }[] }[] = [];
  for (const b of blocks) {
    if (b.type !== 'heading') continue;
    if (b.level === 2) out.push({ id: b.id, text: b.text, children: [] });
    else out.at(-1)?.children.push({ id: b.id, text: b.text }); // a small heading before any section has no parent
  }
  return out;
}

/** Ids of the pictures used in a body, each once. */
export const bodyImageIds = (blocks: Block[]) => [
  ...new Set(blocks.flatMap((b) => (b.type === 'image' ? [b.id] : []))),
];

/** Plain text of a body (for search): no markers, no links. */
export function bodyPlainText(blocks: Block[]): string {
  const inline = (parts: Inline[]) => parts.map((p) => p.text).join('');
  return blocks
    .map((b) => {
      if (b.type === 'heading') return b.text;
      if (b.type === 'image') return b.caption;
      if (b.type === 'list') return b.items.map(inline).join(' ');
      return inline(b.children);
    })
    .filter((text) => text !== '')
    .join(' ');
}

/** How much of an article's text goes into the search index (characters); the rest is still on the page. */
export const SEARCH_TEXT_LIMIT = 5000;

/** The plain text of an article for the search index, cut at a word boundary at `limit` characters. */
export function searchText(blocks: Block[], limit = SEARCH_TEXT_LIMIT): string {
  const text = bodyPlainText(blocks).replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit * 0.8 ? cut.slice(0, lastSpace) : cut).trim();
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
export interface ArticleCheckInput {
  kind: string;
  /** Address name; checked only when given. */
  slug?: string;
  isVisible: boolean;
  title: string;
  excerpt: string | null;
  body: string | null;
  publishedOn: string | null;
  reviewedBy: string | null;
  /** Kind of the chosen category, null when there is none. */
  categoryKind: string | null;
  /** Today as YYYY-MM-DD. */
  today: string;
}

/**
 * What stops an article from being saved or published, keyed by form field. A draft (not visible) only has
 * to be consistent; a published one must be complete. Travel guides do not need a clinical reviewer, Dental
 * knowledge articles do: medical content must say who checked it.
 */
export function articleProblems(i: ArticleCheckInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isArticleKind(i.kind)) errors.kind = 'Please choose the kind of article.';
  if (i.slug !== undefined && RESERVED_ARTICLE_SLUGS.includes(i.slug)) {
    errors.slug = `“${i.slug}” is used by the list pages. Please choose a different address name.`;
  }
  if (i.categoryKind && i.categoryKind !== i.kind) {
    errors.category_id = 'This category belongs to the other kind of article. Choose another one.';
  }
  if (!i.isVisible) return errors;

  if (parseArticleBody(i.body).length === 0) {
    errors.body = 'A published article needs some text. Untick “Published” to save it as a draft.';
  }
  if (!i.excerpt?.trim()) errors.excerpt = 'Add a short summary: it is shown on the article cards.';
  if (!i.publishedOn) errors.published_on = 'Add the publication date.';
  else if (i.publishedOn > i.today) {
    errors.published_on = 'The date is in the future. Use today’s date or earlier.';
  }
  if (i.kind === 'dental_knowledge' && !i.reviewedBy?.trim()) {
    errors.reviewed_by =
      'Dental knowledge articles must say who reviewed them clinically, for example “Melatec Dental Team”.';
  }
  return errors;
}

/** '2026-06-29' -> 'Jun 29, 2026': the short form for cards. */
export function formatArticleDateShort(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

/** '2026-06-29' -> 'June 29, 2026' (fixed to UTC so the build machine's time zone cannot shift the day). */
export function formatArticleDate(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}
