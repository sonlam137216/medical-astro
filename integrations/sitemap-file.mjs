// Astro integration: writes /sitemap.xml from the pages that were just built (so articles, categories and
// list pages are always included, and nothing is listed by hand). Only runs for an indexable build with a
// known site origin; otherwise there is no sitemap (robots.txt then disallows everything).
// Plain JavaScript, not type-checked.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const escapeXml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Pages that must not be in a sitemap: private areas and anything that is not a content page. */
export function isSitemapPath(pathname) {
  return !/^\/(admin|api|media)(\/|$)/.test(pathname) && !/\.[a-z0-9]+$/i.test(pathname);
}

/** Whether a page's HTML asks search engines to keep it out (a page hidden in Pages (SEO)). */
export const isNoindexPage = (html) => /<meta name="robots" content="[^"]*noindex/.test(html);

/** A page's address without a trailing slash, the form pages are served and linked at (build.format 'file'). */
export const pagePathname = (pathname) => `/${pathname.replace(/^\/+|\/+$/g, '')}`;

/** `pathnames` as the sitemap XML (sorted, no duplicates), each as an absolute URL under `origin`. */
export function renderSitemap(origin, pathnames) {
  const urls = [
    ...new Set(
      pathnames
        .map(pagePathname)
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
        // A page that is noindex must not be offered to search engines in the sitemap either.
        const listed = [];
        for (const { pathname } of pages) {
          // Astro names the Home page '' and the others 'about' (or 'about/'); the files are index.html and
          // about.html (build.format 'file'), or about/index.html for a directory-style build.
          const path = pathname.replace(/\/+$/, '');
          const files = path === '' ? ['index.html'] : [`${path}.html`, `${path}/index.html`];
          let html = '';
          for (const name of files) {
            html = await readFile(fileURLToPath(new URL(name, dir)), 'utf8').catch(() => '');
            if (html) break;
          }
          if (!isNoindexPage(html)) listed.push(pathname);
        }
        const xml = renderSitemap(origin, listed);
        await writeFile(fileURLToPath(new URL('sitemap.xml', dir)), xml);
        logger.info(`sitemap.xml: ${xml.split('<url>').length - 1} pages`);
      },
    },
  };
}
