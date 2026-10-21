import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { buildSnapshot, isSnapshot, snapshotProblems } from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

const setup = () => {
  const { raw, sql } = testDb();
  return { raw, db: createDb(sql, { actorId: 'admin-1', audit: true }) };
};

const ids = {
  a: '11111111-1111-4111-8111-111111111111',
  b: '22222222-2222-4222-8222-222222222222',
};

const addPictures = (raw: ReturnType<typeof testDb>['raw']) => {
  const media = raw.prepare(
    `INSERT INTO media_assets (id, r2_key, kind, mime_type, size_bytes, width, height, alt_text, variant_widths)
     VALUES (?, ?, 'image', 'image/webp', 1000, 960, 1200, ?, '[480,960]')`,
  );
  media.run(ids.a, `media/${ids.a}/v1/960.webp`, 'Newspaper article about Melatec');
  media.run(ids.b, `media/${ids.b}/v1/960.webp`, null);
};

const insert =
  'INSERT INTO press_articles (title, body, url, image_id, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?)';

test('an article needs a web link and keeps its picture from being deleted', () => {
  const { raw } = setup();
  addPictures(raw);
  assert.match(failure(raw, insert, 'Bad link', null, 'javascript:alert(1)', ids.a, 0, 1), /CHECK/);
  assert.match(failure(raw, insert, 'Relative', null, '/about', ids.a, 0, 1), /CHECK/);
  assert.match(
    failure(raw, insert, 'Empty text', '', 'https://example.com/a', ids.a, 0, 1),
    /CHECK/,
  );
  raw.prepare(insert).run('Ok', null, 'https://example.com/a', ids.a, 0, 1);
  assert.match(failure(raw, 'DELETE FROM media_assets WHERE id = ?', ids.a), /FOREIGN KEY/);
});

test('the snapshot has the shown articles in order, with their text only when given and no admin name', async () => {
  const { raw, db } = setup();
  addPictures(raw);
  const row = raw.prepare(insert);
  row.run('Second', 'Headline of the paper', 'https://example.com/2', ids.a, 2, 1);
  row.run('First', null, 'https://example.com/1', ids.a, 1, 1);
  row.run('Hidden', null, 'https://example.com/3', ids.a, 0, 0);

  const snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.pressArticles?.map((a) => [a.url, a.text, a.image.key]),
    [
      ['https://example.com/1', undefined, `media/${ids.a}/v1/960.webp`],
      ['https://example.com/2', 'Headline of the paper', `media/${ids.a}/v1/960.webp`],
    ],
  );
  assert.equal('text' in snapshot.pressArticles![0], false);
  assert.equal(JSON.stringify(snapshot.pressArticles).includes('First'), false);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), []);
});

test('no article, no pressArticles; a picture without a description blocks the publish', async () => {
  const { raw, db } = setup();
  addPictures(raw);
  assert.equal('pressArticles' in (await buildSnapshot(db)), false);

  raw.prepare(insert).run('Paper', null, 'https://example.com/1', ids.b, 0, 1);
  assert.deepEqual(snapshotProblems(await buildSnapshot(db)), [
    'Home: in the news, article 1: the picture has no description. Add one in Media.',
  ]);
});

test('a snapshot with a malformed article is refused', () => {
  const image = {
    key: 'media/x/v1/960.webp',
    width: 960,
    height: 1200,
    alt: 'x',
    decorative: false,
    widths: [960],
  };
  assert.equal(isSnapshot({ pressArticles: [{ url: 'https://example.com', image }] }), true);
  assert.equal(
    isSnapshot({ pressArticles: [{ url: 'https://example.com', text: 'Hi', image }] }),
    true,
  );
  assert.equal(isSnapshot({ pressArticles: [{ url: 'javascript:alert(1)', image }] }), false);
  assert.equal(
    isSnapshot({ pressArticles: [{ url: 'https://example.com', text: 1, image }] }),
    false,
  );
  assert.equal(isSnapshot({ pressArticles: [{ url: 'https://example.com' }] }), false);
});
