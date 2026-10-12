// Astro integration: writes /sitemap.xml from the pages that were just built (so articles, categories and
// list pages are always included, and nothing is listed by hand). Only runs for an indexable build with a
// known site origin; otherwise there is no sitemap (robots.txt then disallows everything).
// Plain JavaScript, not type-checked.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const escapeXml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Pages that must not be in a sitemap: private areas and anything that is not a content page. */
export function isSitemapPath(pathname) {
  return !/^\/(admin|api|media)(\/|$)/.test(pathname) && !/\.[a-z0-9]+$/i.test(pathname);
}

/** `pathnames` as the sitemap XML (sorted, no duplicates), each as an absolute URL under `origin`. */
export function renderSitemap(origin, pathnames) {
  const urls = [
    ...new Set(
      pathnames
        .map((p) => (p.startsWith('/') ? p : `/${p}`))
        .filter(isSitemapPath)
        .map((p) => `${origin}${p}`),
    ),
  ].sort();
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`).join('\n') +
    '\n</urlset>\n'
  );
}

export default function sitemapFile({ origin, indexable }) {
  return {
    name: 'melatec-sitemap-file',
    hooks: {
      'astro:build:done': async ({ dir, pages, logger }) => {
        if (!indexable || !origin) return;
        const xml = renderSitemap(
          origin,
          pages.map((p) => p.pathname),
        );
        await writeFile(fileURLToPath(new URL('sitemap.xml', dir)), xml);
        logger.info(`sitemap.xml: ${xml.split('<url>').length - 1} pages`);
      },
    },
  };
}
