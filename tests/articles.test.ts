import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  articlePath,
  articleProblems,
  bodyPlainText,
  parseArticleBody,
  parseInline,
  tableOfContents,
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
