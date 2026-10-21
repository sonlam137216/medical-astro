// SEO and indexing check of the built site (run `npm run build` first).
//   npm run check:seo                                   a normal build: every page is noindex, robots.txt refuses all,
//                                                       no sitemap, no canonical or share tags pointing anywhere
//   npm run check:seo -- --site=https://example.com     a build made with SITE_URL=<that> SITE_INDEXABLE=true: robots.txt
//                                                       and sitemap.xml are right, every page has its canonical address,
//                                                       share tags with absolute URLs and valid JSON-LD, and no noindex
// This guards the switch between "not launched" and "launched": a launch build that is still noindex, or a staging
// build that points search engines at the real domain, are both found here.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listPages, root } from './lib/dist-server.mjs';

const siteArg = process.argv.find((a) => a.startsWith('--site='))?.split('=')[1];
const origin = siteArg ? new URL(siteArg).origin : undefined;
if (!existsSync(root)) {
  console.error('No build found. Run "npm run build" first.');
  process.exit(2);
}

const problems = [];
const fail = (where, what) => problems.push(`${where}: ${what}`);
const read = (file) =>
  existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null;
const tag = (html, re) => re.exec(html)?.[1];

const pages = listPages();
const robots = read('robots.txt');
const sitemap = read('sitemap.xml');
if (robots === null) fail('robots.txt', 'missing');

if (!origin) {
  if (robots !== null && !/^Disallow: \/$/m.test(robots))
    fail('robots.txt', 'does not refuse all crawlers');
  if (sitemap !== null) fail('sitemap.xml', 'exists on a build that is not indexable');
} else {
  if (robots !== null) {
    if (/^Disallow: \/$/m.test(robots))
      fail('robots.txt', 'refuses all crawlers on an indexable build');
    if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`))
      fail('robots.txt', 'does not name the sitemap');
    for (const area of ['/admin/', '/api/']) {
      if (!robots.includes(`Disallow: ${area}`))
        fail('robots.txt', `does not keep crawlers out of ${area}`);
    }
  }
  if (sitemap === null) fail('sitemap.xml', 'missing');
}

for (const path of pages) {
  const file = path.endsWith('/') ? `${path}index.html` : `${path}.html`;
  const html = read(file.slice(1));
  if (html === null) continue;
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  const canonical = tag(html, /<link rel="canonical" href="([^"]*)"/);
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)];
  // Search engine ownership tags (Site details): on the Home page of an indexable build only.
  const verification = /<meta name="(?:google-site-verification|msvalidate\.01)"/.test(html);
  if (verification && (!origin || path !== '/'))
    fail(
      path,
      `has a search engine verification tag ${origin ? 'outside the Home page' : 'on a build that is not indexable'}`,
    );

  if (!origin) {
    if (!noindex) fail(path, 'is indexable on a build that should be noindex');
    if (canonical)
      fail(path, `has a canonical address (${canonical}) on a build that is not indexable`);
    if (html.includes('property="og:'))
      fail(path, 'has share tags on a build that is not indexable');
    if (jsonLd.length > 0) fail(path, 'has structured data on a build that is not indexable');
    continue;
  }

  // A page can be hidden on purpose (Pages (SEO) in the admin): then it must also be out of the sitemap.
  // The Home page can never be hidden: that is always a mistake.
  if (noindex) {
    if (path === '/') fail(path, 'the Home page is noindex on an indexable build');
    if (sitemap?.includes(`<loc>${origin}${path}</loc>`))
      fail(path, 'is noindex but is in sitemap.xml');
    continue;
  }
  if (canonical !== `${origin}${path}`)
    fail(path, `canonical is ${canonical ?? 'missing'}, expected ${origin}${path}`);
  if (!tag(html, /<title>([^<]+)<\/title>/)) fail(path, 'has no title');
  if (!tag(html, /<meta name="description" content="([^"]+)"/))
    fail(path, 'has no meta description');
  const image = tag(html, /<meta property="og:image" content="([^"]*)"/);
  if (!image || !image.startsWith('https://'))
    fail(path, `og:image is not an absolute address (${image})`);
  // Library pictures (/media/…) are served by the Worker or the media CDN, not by the build: only files of the build are checked.
  else if (
    image.startsWith(origin) &&
    !new URL(image).pathname.startsWith('/media/') &&
    !existsSync(join(root, new URL(image).pathname))
  ) {
    fail(path, `og:image ${image} is not in the build`);
  }
  if (tag(html, /<meta property="og:url" content="([^"]*)"/) !== canonical)
    fail(path, 'og:url differs from the canonical address');
  for (const [, json] of jsonLd) {
    try {
      const data = JSON.parse(json);
      for (const item of Array.isArray(data) ? data : [data]) {
        if (item['@context'] !== 'https://schema.org' || !item['@type'])
          fail(path, 'JSON-LD without @context/@type');
        if (item.mainEntityOfPage && item.mainEntityOfPage !== canonical)
          fail(
            path,
            `JSON-LD mainEntityOfPage ${item.mainEntityOfPage} differs from the canonical address`,
          );
      }
    } catch {
      fail(path, 'JSON-LD is not valid JSON');
    }
  }
  if (sitemap && !sitemap.includes(`<loc>${origin}${path}</loc>`))
    fail(path, 'is not in sitemap.xml');
}

if (origin && pages.length > 0) {
  const home = read('index.html') ?? '';
  if (!/"@type":"Dentist"/.test(home)) fail('/', 'has no Dentist structured data');
}

if (problems.length > 0) {
  console.log(problems.join('\n'));
  console.log(`SEO check: ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(
  `SEO check (${origin ? `indexable build for ${origin}` : 'build that is not indexable'}): ${pages.length} pages, no problems.`,
);
