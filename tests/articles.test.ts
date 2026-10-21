import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTICLES_PER_PAGE,
  RESERVED_ARTICLE_SLUGS,
  articlePath,
  bodyImageIds,
  categoryBasePath,
  listPagePath,
  movedArticleRedirect,
  paginate,
  relatedArticles,
  formatArticleDate,
  formatArticleDateShort,
  articleProblems,
  bodyPlainText,
  parseArticleBody,
  parseInline,
  searchText,
  tableOfContents,
  tocOutline,
} from '../src/lib/cms/articles.ts';
import { createDb } from '../src/lib/db.ts';
import { buildSnapshot, isSnapshot, snapshotProblems } from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

// ---- body format -----------------------------------------------------------------------------------------
test('the body parser understands headings, paragraphs, lists and quotes', () => {
  const blocks = parseArticleBody(
    [
      '## Getting there',
      'First line',
      'second line.',
      '',
      '- one',
      '- two',
      '',
      '1. step',
      '2) next step',
      '> a quote',
      '### Details',
    ].join('\n'),
  );
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['heading', 'paragraph', 'list', 'list', 'quote', 'heading'],
  );
  assert.deepEqual(blocks[1], {
    type: 'paragraph',
    children: [{ text: 'First line second line.' }],
  });
  const lists = blocks.filter((b) => b.type === 'list');
  assert.deepEqual(
    lists.map((l) => l.ordered),
    [false, true],
  );
  assert.equal(lists[0].items.length, 2);
});

test('headings get unique ids and feed the table of contents (sections only)', () => {
  const blocks = parseArticleBody('## Visa\n\ntext\n\n## Visa\n\n### Sub\n\n## Đà Nẵng!\n\n## !!!');
  const ids = blocks.filter((b) => b.type === 'heading').map((b) => b.id);
  assert.deepEqual(ids, ['visa', 'visa-2', 'sub', 'da-nang', 'section']);
  assert.deepEqual(tableOfContents(blocks), [
    { id: 'visa', text: 'Visa' },
    { id: 'visa-2', text: 'Visa' },
    { id: 'da-nang', text: 'Đà Nẵng!' },
    { id: 'section', text: '!!!' },
  ]);
});

test('markup typed by an editor stays text; unsafe link targets are dropped', () => {
  const blocks = parseArticleBody(
    '<script>alert(1)</script> <b>x</b> [bad](javascript:alert(1)) [bad2](data:text/html,x) [ok](/about) [ext](https://example.com/a?b=1) **bold**',
  );
  assert.equal(blocks.length, 1);
  const para = blocks[0];
  assert.equal(para.type, 'paragraph');
  const inline = para.type === 'paragraph' ? para.children : [];
  // No inline item carries a javascript:/data: target, and the raw tags are plain characters in a text node.
  assert.ok(inline.every((p) => !p.href || /^(\/|https:\/\/)/.test(p.href)));
  assert.deepEqual(
    inline.filter((p) => p.href).map((p) => p.href),
    ['/about', 'https://example.com/a?b=1'],
  );
  assert.ok(inline.some((p) => p.text.includes('<script>alert(1)</script>')));
  assert.ok(inline.some((p) => p.bold && p.text === 'bold'));
  assert.deepEqual(parseInline('[bad](javascript:alert(1))'), [{ text: 'bad' }]);
  // "//host" and "/\host" open another site, so they are dropped like any other unsafe target.
  assert.deepEqual(parseInline('[x](//evil.example/a)'), [{ text: 'x' }]);
  assert.deepEqual(parseInline('[x](/\\evil.example/a)'), [{ text: 'x' }]);
  assert.deepEqual(parseInline('[x](/about#team)'), [{ text: 'x', href: '/about#team' }]);
});

test('empty or blank bodies have no blocks', () => {
  for (const v of [null, undefined, '', '   \n\n  ']) assert.deepEqual(parseArticleBody(v), []);
});

test('plain text for search drops the markers', () => {
  assert.equal(
    bodyPlainText(parseArticleBody('## Title\n\nSome **bold** and [a link](/x).\n\n- a\n- b')),
    'Title Some bold and a link. a b',
  );
});

test('article addresses follow the kind', () => {
  assert.equal(articlePath('travel_guide', 'da-nang'), '/travel-guide/da-nang');
  assert.equal(articlePath('dental_knowledge', 'implants'), '/dental-knowledge/implants');
});

test('article dates are formatted in English and tolerate bad input', () => {
  assert.equal(formatArticleDate('2026-06-29'), 'June 29, 2026');
  assert.equal(formatArticleDate('2026-01-01'), 'January 1, 2026');
  for (const v of [null, undefined, '', 'yesterday', '2026-13-40', '29/06/2026'])
    assert.equal(formatArticleDate(v), null, String(v));
});

test('the outline nests small headings under their section', () => {
  const blocks = parseArticleBody('### Orphan\n\n## A\n\n### A1\n\n### A2\n\n## B');
  assert.deepEqual(tocOutline(blocks), [
    {
      id: 'a',
      text: 'A',
      children: [
        { id: 'a1', text: 'A1' },
        { id: 'a2', text: 'A2' },
      ],
    },
    { id: 'b', text: 'B', children: [] },
  ]);
});

test('short dates for the cards', () => {
  assert.equal(formatArticleDateShort('2026-06-29'), 'Jun 29, 2026');
  assert.equal(formatArticleDateShort('nope'), null);
});

// ---- rules -----------------------------------------------------------------------------------------------
const complete = {
  kind: 'travel_guide',
  isVisible: true,
  title: 'Da Nang',
  excerpt: 'A coastal city.',
  body: '## Beaches\n\nSand.',
  publishedOn: '2026-10-01',
  reviewedBy: null,
  categoryKind: null,
  today: '2026-10-10',
};

test('a complete published travel guide has no problems and needs no clinical reviewer', () => {
  assert.deepEqual(articleProblems(complete), {});
});

test('a published article needs text, a summary and a date', () => {
  assert.ok(articleProblems({ ...complete, body: '   ' }).body);
  assert.ok(articleProblems({ ...complete, body: null }).body);
  assert.ok(articleProblems({ ...complete, excerpt: ' ' }).excerpt);
  assert.ok(articleProblems({ ...complete, publishedOn: null }).published_on);
  assert.ok(articleProblems({ ...complete, publishedOn: '2026-10-11' }).published_on);
  assert.deepEqual(articleProblems({ ...complete, publishedOn: '2026-10-10' }), {});
});

test('drafts may be incomplete', () => {
  assert.deepEqual(
    articleProblems({
      ...complete,
      isVisible: false,
      body: null,
      excerpt: null,
      publishedOn: null,
    }),
    {},
  );
});

test('dental knowledge needs a clinical reviewer, a travel guide does not', () => {
  const knowledge = { ...complete, kind: 'dental_knowledge' };
  assert.ok(articleProblems(knowledge).reviewed_by);
  assert.ok(articleProblems({ ...knowledge, reviewedBy: '  ' }).reviewed_by);
  assert.deepEqual(articleProblems({ ...knowledge, reviewedBy: 'Melatec Dental Team' }), {});
  assert.deepEqual(articleProblems({ ...knowledge, isVisible: false }), {});
});

test('the category must be of the same kind, even for a draft', () => {
  assert.ok(articleProblems({ ...complete, categoryKind: 'dental_knowledge' }).category_id);
  assert.ok(
    articleProblems({ ...complete, isVisible: false, categoryKind: 'dental_knowledge' })
      .category_id,
  );
  assert.deepEqual(articleProblems({ ...complete, categoryKind: 'travel_guide' }), {});
  assert.ok(articleProblems({ ...complete, kind: 'news' }).kind);
});

// ---- database and snapshot -------------------------------------------------------------------------------
const setup = () => {
  const { raw, sql } = testDb();
  const db = createDb(sql, { actorId: 'admin-1', audit: true });
  return { raw, db };
};
const insertArticle = (raw: ReturnType<typeof testDb>['raw'], o: Record<string, unknown>) => {
  const row = {
    slug: 'a',
    kind: 'travel_guide',
    title: 'T',
    excerpt: 'E',
    body: '## H\n\nText',
    published_on: '2026-10-01',
    is_visible: 1,
    ...o,
  };
  const cols = Object.keys(row);
  raw
    .prepare(`INSERT INTO articles (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...(Object.values(row) as never[]));
};

test('categories and the new article columns are constrained by the database', () => {
  const { raw } = setup();
  assert.match(
    failure(
      raw,
      "INSERT INTO article_categories (slug, kind, name) VALUES ('Bad Slug', 'travel_guide', 'x')",
    ),
    /CHECK/,
  );
  assert.match(
    failure(raw, "INSERT INTO article_categories (slug, kind, name) VALUES ('ok', 'news', 'x')"),
    /CHECK/,
  );
  insertArticle(raw, { slug: 'dup' });
  assert.match(
    failure(raw, "INSERT INTO articles (slug, kind, title) VALUES ('dup', 'travel_guide', 'x')"),
    /UNIQUE/,
  );
  assert.match(
    failure(
      raw,
      "INSERT INTO articles (slug, kind, title, reviewed_on) VALUES ('r', 'travel_guide', 'x', 'yesterday')",
    ),
    /CHECK/,
  );
  assert.match(
    failure(
      raw,
      "INSERT INTO articles (slug, kind, title, category_id) VALUES ('c', 'travel_guide', 'x', 'missing')",
    ),
    /FOREIGN KEY/,
  );
});

test('deleting a category keeps its articles', () => {
  const { raw } = setup();
  raw
    .prepare(
      "INSERT INTO article_categories (id, slug, kind, name) VALUES ('c1', 'general', 'dental_knowledge', 'General')",
    )
    .run();
  insertArticle(raw, {
    slug: 'x',
    kind: 'dental_knowledge',
    category_id: 'c1',
    reviewed_by: 'Team',
  });
  raw.prepare("DELETE FROM article_categories WHERE id = 'c1'").run();
  const row = raw.prepare("SELECT category_id FROM articles WHERE slug = 'x'").get() as {
    category_id: string | null;
  };
  assert.equal(row.category_id, null);
});

test('the snapshot holds published articles only; drafts and hidden categories stay out', async () => {
  const { raw, db } = setup();
  raw
    .prepare(
      "INSERT INTO article_categories (id, slug, kind, name, sort_order) VALUES ('c1', 'general', 'dental_knowledge', 'General', 1)",
    )
    .run();
  raw
    .prepare(
      "INSERT INTO article_categories (id, slug, kind, name, is_visible) VALUES ('c2', 'hidden', 'dental_knowledge', 'Hidden', 0)",
    )
    .run();
  insertArticle(raw, {
    slug: 'live',
    kind: 'dental_knowledge',
    title: 'Live',
    category_id: 'c1',
    reviewed_by: 'Melatec Dental Team',
    author_name: 'A. Writer',
  });
  insertArticle(raw, { slug: 'draft', title: 'Draft', is_visible: 0 });
  insertArticle(raw, {
    slug: 'in-hidden-category',
    kind: 'dental_knowledge',
    title: 'Hidden cat',
    category_id: 'c2',
    reviewed_by: 'Team',
    published_on: '2026-09-01',
  });

  const snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.articles?.map((a) => a.slug),
    ['live', 'in-hidden-category'],
  );
  assert.deepEqual(
    snapshot.articleCategories?.map((c) => c.slug),
    ['general'],
  );
  const live = snapshot.articles?.[0];
  assert.equal(live?.category, 'general');
  assert.equal(live?.author, 'A. Writer');
  assert.equal(live?.reviewedBy, 'Melatec Dental Team');
  assert.match(live?.updatedOn ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(snapshot.articles?.[1].category, null);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), []);
});

test('with no published article the snapshot has no articles section', async () => {
  const { raw, db } = setup();
  insertArticle(raw, { is_visible: 0 });
  const snapshot = await buildSnapshot(db);
  assert.equal(snapshot.articles, undefined);
  assert.equal(snapshot.articleCategories, undefined);
});

test('an incomplete published article blocks publishing instead of being dropped', async () => {
  const { raw, db } = setup();
  insertArticle(raw, { slug: 'empty', title: 'Empty one', body: null });
  insertArticle(raw, { slug: 'k', kind: 'dental_knowledge', title: 'No reviewer' });
  const snapshot = await buildSnapshot(db);
  assert.equal(snapshot.articles?.length, 2);
  const problems = snapshotProblems(snapshot);
  assert.ok(problems.some((p) => p.includes('Empty one') && p.includes('needs some text')));
  assert.ok(problems.some((p) => p.includes('No reviewer') && p.includes('reviewed')));
});

test('a cover image without a description blocks publishing', async () => {
  const { raw, db } = setup();
  raw
    .prepare(
      "INSERT INTO media_assets (id, r2_key, kind, mime_type, size_bytes, width, height, variant_widths) VALUES ('m1', 'media/m1/v1/480.webp', 'image', 'image/webp', 1, 480, 300, '[480]')",
    )
    .run();
  insertArticle(raw, { slug: 'pic', title: 'With picture', cover_image_id: 'm1' });
  const snapshot = await buildSnapshot(db);
  assert.equal(snapshot.articles?.[0].coverImage?.key, 'media/m1/v1/480.webp');
  assert.ok(snapshotProblems(snapshot).some((p) => p.includes('cover image has no description')));
});

test('article audit rows never carry the body text', async () => {
  const { raw, db } = setup();
  const { error } = await db
    .from('articles')
    .insert({ slug: 'audited', kind: 'travel_guide', title: 'Audited', body: 'SECRET BODY TEXT' });
  assert.equal(error, null);
  const rows = raw
    .prepare("SELECT changes FROM audit_logs WHERE table_name = 'articles'")
    .all() as {
    changes: string | null;
  }[];
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => !String(r.changes).includes('SECRET BODY TEXT')));
});

test('the old "Show on the service pages" flag is no longer published; revisions that carry it stay valid', async () => {
  const { raw, db } = setup();
  insertArticle(raw, { slug: 'offer', title: 'Offer', show_on_service_pages: 1 });
  const snapshot = await buildSnapshot(db);
  assert.equal('onServicePages' in (snapshot.articles?.[0] ?? {}), false);
  assert.equal(
    isSnapshot({ ...snapshot, articles: [{ ...snapshot.articles?.[0], onServicePages: true }] }),
    true,
  );
  assert.equal(
    isSnapshot({ ...snapshot, articles: [{ ...snapshot.articles?.[0], onServicePages: 'yes' }] }),
    false,
  );
});

// ---- pictures in the text --------------------------------------------------------------------------------
const PIC = '3f2b8c1e-7a4d-4b6e-9c10-2d5e8f7a9b01';

test('a picture line becomes an image block; anything else with that shape stays text', () => {
  const blocks = parseArticleBody(`Intro\n\n![Hoi An at night](media:${PIC})\n\n![](media:${PIC})`);
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['paragraph', 'image', 'image'],
  );
  assert.deepEqual(blocks[1], { type: 'image', id: PIC, caption: 'Hoi An at night' });
  assert.deepEqual(blocks[2], { type: 'image', id: PIC, caption: '' });
  assert.deepEqual(bodyImageIds(blocks), [PIC]);
  // Not a media id, or sitting inside a sentence: ordinary text, never a request for a file.
  for (const line of [
    '![x](https://example.com/a.png)',
    '![x](media:not-an-id)',
    `text ![x](media:${PIC}) more`,
  ]) {
    assert.deepEqual(
      parseArticleBody(line).map((b) => b.type),
      ['paragraph'],
      line,
    );
  }
  assert.equal(bodyPlainText(blocks), 'Intro Hoi An at night');
});

// ---- list pages ------------------------------------------------------------------------------------------
test('pagination clamps the page and reports the total', () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const first = paginate(items, 1, 9);
  assert.deepEqual(first, { items: items.slice(0, 9), page: 1, totalPages: 3 });
  assert.deepEqual(paginate(items, 3, 9).items, [18, 19]);
  assert.equal(paginate(items, 99, 9).page, 3);
  assert.equal(paginate(items, -4, 9).page, 1);
  assert.equal(paginate(items, Number.NaN, 9).page, 1);
  assert.deepEqual(paginate([], 1), { items: [], page: 1, totalPages: 1 });
  assert.equal(ARTICLES_PER_PAGE, 9);
});

test('list addresses: page 1 is the folder itself', () => {
  assert.equal(listPagePath('/travel-guide', 1), '/travel-guide');
  assert.equal(listPagePath('/travel-guide', 3), '/travel-guide/page/3');
  const category = categoryBasePath('dental_knowledge', 'implants');
  assert.equal(category, '/dental-knowledge/category/implants');
  assert.equal(listPagePath(category, 2), '/dental-knowledge/category/implants/page/2');
});

test('the words used by list pages cannot be article addresses', () => {
  for (const slug of RESERVED_ARTICLE_SLUGS) {
    assert.ok(articleProblems({ ...complete, slug }).slug, slug);
    assert.ok(articleProblems({ ...complete, slug, isVisible: false }).slug, `${slug} (draft)`);
  }
  assert.deepEqual(articleProblems({ ...complete, slug: 'page-two' }), {});
  assert.deepEqual(articleProblems({ ...complete, slug: 'da-nang' }), {});
});

test('related articles: same category, then same kind, then the other kind', () => {
  const make = (slug: string, kind: string, category: string | null) => ({
    slug,
    kind,
    category: category ? { slug: category } : null,
  });
  const current = make('now', 'dental_knowledge', 'implants');
  const all = [
    make('travel', 'travel_guide', 'implants'), // same category slug, other kind: does not count as same category
    make('other', 'dental_knowledge', 'veneers'),
    make('same', 'dental_knowledge', 'implants'),
    make('now', 'dental_knowledge', 'implants'), // itself
    make('plain', 'dental_knowledge', null),
  ];
  assert.deepEqual(
    relatedArticles(current, all).map((a) => a.slug),
    ['same', 'other', 'plain', 'travel'],
  );
  assert.deepEqual(
    relatedArticles(current, all, 2).map((a) => a.slug),
    ['same', 'other'],
  );
  assert.deepEqual(relatedArticles(current, [make('now', 'dental_knowledge', null)]), []);
});

test('a published article that moves gets a redirect from its old address', () => {
  const before = { kind: 'travel_guide', slug: 'old', isVisible: true };
  assert.deepEqual(
    movedArticleRedirect(before, { kind: 'travel_guide', slug: 'new', isVisible: true }),
    {
      from: '/travel-guide/old',
      to: '/travel-guide/new',
    },
  );
  assert.deepEqual(
    movedArticleRedirect(before, { kind: 'dental_knowledge', slug: 'old', isVisible: true }),
    { from: '/travel-guide/old', to: '/dental-knowledge/old' },
  );
  // Nothing moved, a draft never had a live address, and a page that is switched off has nowhere to go.
  assert.equal(
    movedArticleRedirect(before, { kind: 'travel_guide', slug: 'old', isVisible: true }),
    null,
  );
  assert.equal(
    movedArticleRedirect(
      { ...before, isVisible: false },
      { kind: 'travel_guide', slug: 'new', isVisible: true },
    ),
    null,
  );
  assert.equal(
    movedArticleRedirect(before, { kind: 'travel_guide', slug: 'new', isVisible: false }),
    null,
  );
});

// ---- snapshot: pictures and category text ----------------------------------------------------------------
const insertImage = (
  raw: ReturnType<typeof testDb>['raw'],
  id: string,
  o: Record<string, unknown> = {},
) => {
  const row = {
    id,
    r2_key: `media/${id}/v1/480.webp`,
    kind: 'image',
    mime_type: 'image/webp',
    size_bytes: 1,
    width: 480,
    height: 300,
    variant_widths: '[480]',
    alt_text: 'A beach',
    ...o,
  };
  const cols = Object.keys(row);
  raw
    .prepare(
      `INSERT INTO media_assets (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    )
    .run(...(Object.values(row) as never[]));
};

test('pictures placed in the text travel with the snapshot', async () => {
  const { raw, db } = setup();
  insertImage(raw, PIC);
  insertArticle(raw, {
    slug: 'pics',
    title: 'With pictures',
    body: `## H\n\n![Sand](media:${PIC})`,
  });
  const snapshot = await buildSnapshot(db);
  const article = snapshot.articles?.[0];
  assert.equal(article?.bodyImages?.[PIC]?.key, `media/${PIC}/v1/480.webp`);
  assert.equal(article?.bodyImages?.[PIC]?.alt, 'A beach');
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), []);
});

test('a missing or undescribed picture in the text blocks publishing', async () => {
  const { raw, db } = setup();
  const noAlt = '11111111-1111-4111-8111-111111111111';
  const gone = '22222222-2222-4222-8222-222222222222';
  insertImage(raw, noAlt, { alt_text: null });
  insertArticle(raw, {
    slug: 'a',
    title: 'Undescribed',
    body: `## H\n\n![](media:${noAlt})`,
  });
  insertArticle(raw, { slug: 'b', title: 'Gone', body: `## H\n\n![](media:${gone})` });
  const problems = snapshotProblems(await buildSnapshot(db));
  assert.ok(problems.some((p) => p.includes('Undescribed') && p.includes('no description')));
  assert.ok(problems.some((p) => p.includes('Gone') && p.includes('no longer in Media')));
});

test('an article with a reserved address blocks publishing', async () => {
  const { raw, db } = setup();
  insertArticle(raw, { slug: 'page', title: 'Sneaky' });
  assert.ok(snapshotProblems(await buildSnapshot(db)).some((p) => p.includes('Sneaky')));
});

test('the category description reaches the snapshot', async () => {
  const { raw, db } = setup();
  raw
    .prepare(
      "INSERT INTO article_categories (id, slug, kind, name, description) VALUES ('c1', 'implants', 'dental_knowledge', 'Implants', 'All about implants')",
    )
    .run();
  insertArticle(raw, {
    slug: 'x',
    kind: 'dental_knowledge',
    category_id: 'c1',
    reviewed_by: 'Team',
  });
  const snapshot = await buildSnapshot(db);
  assert.equal(snapshot.articleCategories?.[0].description, 'All about implants');
  assert.match(
    failure(
      raw,
      "INSERT INTO article_categories (slug, kind, name, description) VALUES ('long', 'travel_guide', 'x', ?)",
      'x'.repeat(501),
    ),
    /CHECK/,
  );
});

test('the search text is the plain text of the article, cut at a word', () => {
  const blocks = parseArticleBody(
    '## Implants\n\nA **titanium** post, then a crown.\n\n- Day one\n- Day two',
  );
  assert.equal(searchText(blocks), 'Implants A titanium post, then a crown. Day one Day two');
  const long = parseArticleBody(`${'word '.repeat(50)}`.trim());
  const cut = searchText(long, 42);
  assert.ok(cut.length <= 42);
  assert.ok(/^(word )*word$/.test(cut), `cut at a word boundary: "${cut}"`);
});
