import type { APIRoute } from 'astro';
import { ARTICLE_SEGMENTS } from '../../data/article-lists';
import { parseArticleBody } from '../../lib/cms/articles';
import { getArticles } from '../../lib/content';

// The search index of one kind of article, built with the site (`/travel-guide/search.json`). It holds what a
// visitor would type to find an article: title, summary, category and the section headings of the text. The
// search box fetches it the first time someone types, so pages that never search do not download it.
export const prerender = true;

export function getStaticPaths() {
  return ARTICLE_SEGMENTS.map(([segment, kind]) => ({
    params: { kind: segment },
    props: { kind },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const articles = await getArticles(props.kind);
  const entries = articles.map((a) => ({
    title: a.title,
    excerpt: a.excerpt ?? '',
    category: a.category?.name ?? '',
    path: a.path,
    topics: parseArticleBody(a.body)
      .flatMap((b) => (b.type === 'heading' ? [b.text] : []))
      .join(' '),
  }));
  return new Response(JSON.stringify({ articles: entries }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
