import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  absoluteUrl,
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  pageUrl,
  organizationJsonLd,
} from '../src/lib/seo.ts';
import { isSitemapPath, renderSitemap } from '../integrations/sitemap-file.mjs';

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
    '/',
    '/about/',
    '/admin/',
    'search.json',
  ]);
  assert.equal(xml.match(/<loc>/g)?.length, 2);
  assert.ok(xml.includes('<loc>https://melatec.example/about/</loc>'));
  assert.ok(xml.includes('<loc>https://melatec.example/</loc>'));
});

test('page addresses carry the trailing slash the build serves, files do not', () => {
  assert.equal(pageUrl('https://melatec.example', '/about'), 'https://melatec.example/about/');
  assert.equal(pageUrl('https://melatec.example', '/about/'), 'https://melatec.example/about/');
  assert.equal(pageUrl('https://melatec.example', '/'), 'https://melatec.example/');
  assert.equal(
    pageUrl('https://melatec.example', '/og-default.jpg'),
    'https://melatec.example/og-default.jpg',
  );
  assert.equal(pageUrl(undefined, '/about'), undefined);
});
