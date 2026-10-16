import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  absoluteUrl,
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  pageUrl,
  pagePath,
  largestImageUrl,
  metaDescription,
  DESCRIPTION_MAX,
  organizationJsonLd,
} from '../src/lib/seo.ts';
import { isNoindexPage, isSitemapPath, renderSitemap } from '../integrations/sitemap-file.mjs';

test('absoluteUrl resolves against the site and leaves full addresses alone', () => {
  assert.equal(
    absoluteUrl('https://melatec.example', '/og-default.jpg'),
    'https://melatec.example/og-default.jpg',
  );
  assert.equal(absoluteUrl(undefined, '/x'), undefined);
  assert.equal(absoluteUrl(undefined, 'https://cdn.example/a.webp'), 'https://cdn.example/a.webp');
});

test('JSON-LD text can never close the script tag', () => {
  const out = jsonLdString({ a: '</script><script>alert(1)</script>' });
  assert.ok(!out.includes('</script>'));
  assert.equal(JSON.parse(out).a, '</script><script>alert(1)</script>');
});

test('the organization lists only what is known', () => {
  const org = organizationJsonLd({
    name: 'Melatec',
    url: 'https://melatec.example/',
    phone: null,
    email: 'hello@melatec.example',
    sameAs: [null, 'https://facebook.com/melatec'],
    locations: [
      { name: 'Hanoi', address: '1 Example Street, Hanoi' },
      { name: 'No address', address: '' },
    ],
  });
  assert.equal(org['@type'], 'Dentist');
  assert.equal('telephone' in org, false);
  assert.equal(org.email, 'hello@melatec.example');
  assert.deepEqual(org.sameAs, ['https://facebook.com/melatec']);
  assert.equal((org.location as unknown[]).length, 1);
});

test('FAQ data skips unanswered questions and is absent when none is answered', () => {
  assert.equal(
    faqJsonLd([
      { question: 'Q?', answer: null },
      { question: 'R?', answer: '  ' },
    ]),
    null,
  );
  const data = faqJsonLd([
    { question: 'Q?', answer: 'A.' },
    { question: 'R?', answer: null },
  ]) as { mainEntity: { name: string }[] };
  assert.deepEqual(
    data.mainEntity.map((q) => q.name),
    ['Q?'],
  );
});

test('an article reviewed by a clinician is also a medical web page', () => {
  const base = {
    url: 'https://melatec.example/dental-knowledge/x',
    title: 'X',
    publisher: { name: 'Melatec', url: 'https://melatec.example/' },
  };
  assert.equal(articleJsonLd(base)['@type'], 'Article');
  const reviewed = articleJsonLd({ ...base, reviewedBy: 'Dr A', reviewedOn: '2026-10-01' });
  assert.deepEqual(reviewed['@type'], ['Article', 'MedicalWebPage']);
  assert.equal(reviewed.lastReviewed, '2026-10-01');
  assert.equal('author' in reviewed, false);
});

test('breadcrumbs are numbered and the last item has no link', () => {
  const list = breadcrumbJsonLd([{ name: 'Home', url: 'https://x/' }, { name: 'Page' }]) as {
    itemListElement: { position: number; item?: string }[];
  };
  assert.deepEqual(
    list.itemListElement.map((i) => i.position),
    [1, 2],
  );
  assert.equal('item' in list.itemListElement[1], false);
});

test('the sitemap lists content pages only, once each, under the site origin', () => {
  assert.equal(isSitemapPath('/admin/'), false);
  assert.equal(isSitemapPath('/api/health'), false);
  assert.equal(isSitemapPath('/travel-guide/search.json'), false);
  assert.equal(isSitemapPath('/about/'), true);
  const xml = renderSitemap('https://melatec.example', [
    'about/',
    'about',
    '/',
    '',
    '/about/',
    '/admin/',
    'admin',
    'search.json',
    'travel-guide/page/2',
  ]);
  assert.equal(xml.match(/<loc>/g)?.length, 3);
  assert.ok(xml.includes('<loc>https://melatec.example/about</loc>'));
  assert.ok(xml.includes('<loc>https://melatec.example/</loc>'));
  assert.ok(xml.includes('<loc>https://melatec.example/travel-guide/page/2</loc>'));
});

test('page addresses have no trailing slash, like the pages the build serves; files are left alone', () => {
  assert.equal(pageUrl('https://melatec.example', '/about'), 'https://melatec.example/about');
  assert.equal(pageUrl('https://melatec.example', '/about/'), 'https://melatec.example/about');
  assert.equal(pageUrl('https://melatec.example', '/'), 'https://melatec.example/');
  assert.equal(
    pageUrl('https://melatec.example', '/og-default.jpg'),
    'https://melatec.example/og-default.jpg',
  );
  assert.equal(pageUrl(undefined, '/about'), undefined);
});

test('the pathname a page sees at build time becomes its address', () => {
  assert.equal(pagePath('/about.html'), '/about');
  assert.equal(pagePath('/about/'), '/about');
  assert.equal(pagePath('/about'), '/about');
  assert.equal(pagePath('/index.html'), '/');
  assert.equal(pagePath('/'), '/');
  assert.equal(pagePath(''), '/');
  assert.equal(pagePath('/travel-guide/page/2.html'), '/travel-guide/page/2');
  assert.equal(pagePath('/travel-guide/index.html'), '/travel-guide');
  // Only a whole "index" segment is the folder's page.
  assert.equal(pagePath('/services/reindex'), '/services/reindex');
});

test('link previews use the widest file of a library picture', () => {
  assert.equal(
    largestImageUrl({
      url: '/media/a/v1/480.webp',
      srcset: '/media/a/v1/480.webp 480w, /media/a/v1/1600.webp 1600w, /media/a/v1/960.webp 960w',
    }),
    '/media/a/v1/1600.webp',
  );
  assert.equal(
    largestImageUrl({ url: '/media/a/v1/480.webp', srcset: '' }),
    '/media/a/v1/480.webp',
  );
});

test('search descriptions are cut at a word, never past the limit', () => {
  assert.equal(metaDescription('  Short   text\n here. '), 'Short text here.');
  assert.equal(metaDescription(''), undefined);
  assert.equal(metaDescription(null), undefined);
  const exact = 'a'.repeat(DESCRIPTION_MAX);
  assert.equal(metaDescription(exact), exact);
  const long = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(8);
  const cut = metaDescription(long)!;
  assert.ok(cut.length <= DESCRIPTION_MAX, `${cut.length} characters`);
  assert.ok(cut.endsWith('…'));
  assert.ok(long.startsWith(cut.slice(0, -1)), 'the cut keeps the text as written');
  assert.match(cut, /[a-z]…$/, 'no trailing comma or space before the ellipsis');
  assert.ok(/\s/.test(long[cut.length - 1] ?? ' '), 'the cut ends at a whole word');
  // One very long word: cut anyway, within the limit.
  assert.equal(metaDescription('x'.repeat(300))!.length, DESCRIPTION_MAX);
});

test('pages that ask for noindex are recognised', () => {
  assert.equal(
    isNoindexPage('<head><meta name="robots" content="noindex, nofollow"></head>'),
    true,
  );
  assert.equal(isNoindexPage('<head><title>x</title></head>'), false);
});
