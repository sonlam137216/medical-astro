import { ARTICLES_PER_PAGE, paginate, type ArticleKind } from './cms/articles';
import { ARTICLE_SEGMENTS } from '../data/article-lists';
import { getArticleCategories, getArticles, type PublicArticle } from './content';

// BUILD-TIME ONLY. Which list pages exist for the published articles: page 1 of each kind and category lives at
// the folder itself, later pages under `/page/<n>`. Used by the `getStaticPaths` of the list routes.

export interface ListTarget {
  kind: ArticleKind;
  /** First folder of the address ('travel-guide'). */
  segment: string;
  category: string | null;
  page: number;
  totalPages: number;
}

/** Categories of a kind that have at least one published article, in display order. */
export async function usedCategories(kind: ArticleKind, articles?: PublicArticle[]) {
  const [categories, all] = await Promise.all([
    getArticleCategories(kind),
    articles ?? getArticles(kind),
  ]);
  return categories.filter((c) => all.some((a) => a.category?.slug === c.slug));
}

/** Every list page to build. `firstPages` false leaves out page 1 (the route `index.astro` builds those). */
export async function listTargets(options: {
  categories: boolean;
  firstPages: boolean;
}): Promise<ListTarget[]> {
  const targets: ListTarget[] = [];
  for (const [segment, kind] of ARTICLE_SEGMENTS) {
    const articles = await getArticles(kind);
    const groups: { category: string | null; count: number }[] = options.categories
      ? (await usedCategories(kind, articles)).map((c) => ({
          category: c.slug,
          count: articles.filter((a) => a.category?.slug === c.slug).length,
        }))
      : [{ category: null, count: articles.length }];
    for (const { category, count } of groups) {
      const totalPages = paginate(Array.from({ length: count }), 1, ARTICLES_PER_PAGE).totalPages;
      for (let page = options.firstPages ? 1 : 2; page <= totalPages; page++) {
        targets.push({ kind, segment, category, page, totalPages });
      }
    }
  }
  return targets;
}
