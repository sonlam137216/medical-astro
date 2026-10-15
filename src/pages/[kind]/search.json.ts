import type { APIRoute } from 'astro';
import { ARTICLE_SEGMENTS } from '../../data/article-lists';
import { parseArticleBody, searchText } from '../../lib/cms/articles';
import { getArticles } from '../../lib/content';

// The search index of one kind of article, built with the site (`/travel-guide/search.json`). It holds what a
// visitor would type to find an article: title, summary, category, the section headings and the text itself
// (the first SEARCH_TEXT_LIMIT characters, so the file stays small). The search box fetches it the first time
// someone types, so pages that never search do not download it.
export const prerender = true;

export function getStaticPaths() {
  return ARTICLE_SEGMENTS.map(([segment, kind]) => ({
    params: { kind: segment },
    props: { kind },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const articles = await getArticles(props.kind);
  const entries = articles.map((a) => {
    const blocks = parseArticleBody(a.body);
    return {
      title: a.title,
      excerpt: a.excerpt ?? '',
      category: a.category?.name ?? '',
      categorySlug: a.category?.slug ?? '',
      path: a.path,
      topics: blocks.flatMap((b) => (b.type === 'heading' ? [b.text] : [])).join(' '),
      text: searchText(blocks),
    };
  });
  return new Response(JSON.stringify({ articles: entries }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
