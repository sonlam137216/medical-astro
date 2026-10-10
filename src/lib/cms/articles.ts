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
  | { type: 'quote'; children: Inline[] };

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
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (heading) {
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

/** Plain text of a body (for search): no markers, no links. */
export function bodyPlainText(blocks: Block[]): string {
  const inline = (parts: Inline[]) => parts.map((p) => p.text).join('');
  return blocks
    .map((b) => {
      if (b.type === 'heading') return b.text;
      if (b.type === 'list') return b.items.map(inline).join(' ');
      return inline(b.children);
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
export interface ArticleCheckInput {
  kind: string;
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

/** '2026-06-29' -> 'June 29, 2026' (fixed to UTC so the build machine's time zone cannot shift the day). */
export function formatArticleDate(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}
