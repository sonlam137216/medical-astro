import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb } from '../src/lib/db.ts';
import { smileStoryErrors } from '../src/lib/cms/smile-stories.ts';
import {
  buildSnapshot,
  isSnapshot,
  sampleSections,
  snapshotProblems,
} from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

const setup = () => {
  const { raw, sql } = testDb();
  return { raw, db: createDb(sql, { actorId: 'admin-1', audit: true }) };
};

const ids = {
  a: '11111111-1111-4111-8111-111111111111',
  b: '22222222-2222-4222-8222-222222222222',
  c: '33333333-3333-4333-8333-333333333333',
  d: '44444444-4444-4444-8444-444444444444',
};

const addPictures = (raw: ReturnType<typeof testDb>['raw']) => {
  const media = raw.prepare(
    `INSERT INTO media_assets (id, r2_key, kind, mime_type, size_bytes, width, height, alt_text, variant_widths)
     VALUES (?, ?, 'image', 'image/webp', 1000, 1120, 880, ?, '[480,960]')`,
  );
  media.run(ids.a, `media/${ids.a}/v1/960.webp`, 'Smile before treatment');
  media.run(ids.b, `media/${ids.b}/v1/960.webp`, 'Smile after treatment');
  media.run(ids.c, `media/${ids.c}/v1/960.webp`, 'Another smile before');
  media.run(ids.d, `media/${ids.d}/v1/960.webp`, null);
};

const insertStory =
  'INSERT INTO smile_stories (title, body, before_image_id, after_image_id, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?)';

test('a story has text and two different pictures, which cannot be deleted while it exists', () => {
  const { raw } = setup();
  addPictures(raw);
  assert.match(failure(raw, insertStory, 'Same picture', 'Text', ids.a, ids.a, 0, 1), /CHECK/);
  assert.match(failure(raw, insertStory, 'No text', '', ids.a, ids.b, 0, 1), /CHECK/);
  assert.match(
    failure(raw, insertStory, 'Too long', 'x'.repeat(3001), ids.a, ids.b, 0, 1),
    /CHECK/,
  );
  raw.prepare(insertStory).run('Story', 'Text', ids.a, ids.b, 0, 1);
  assert.match(failure(raw, 'DELETE FROM media_assets WHERE id = ?', ids.a), /FOREIGN KEY/);
  assert.match(failure(raw, 'DELETE FROM media_assets WHERE id = ?', ids.b), /FOREIGN KEY/);
});

test('the form says why a story cannot be saved', () => {
  const row = { body: 'A **short** story\n\n### Treatment Details\n- One', is_visible: true };
  assert.deepEqual(smileStoryErrors({ ...row, before_image_id: ids.a, after_image_id: ids.b }), {});
  assert.deepEqual(
    Object.keys(smileStoryErrors({ ...row, before_image_id: ids.a, after_image_id: ids.a })),
    ['after_image_id'],
  );
  assert.deepEqual(
    Object.keys(
      smileStoryErrors({
        body: `Text\n\n![](media:${ids.c})`,
        before_image_id: ids.a,
        after_image_id: ids.b,
      }),
    ),
    ['body'],
  );
});

test('the snapshot has the shown stories in order, without their admin names', async () => {
  const { raw, db } = setup();
  addPictures(raw);
  const story = raw.prepare(insertStory);
  story.run('Second (Mrs X)', 'Second story', ids.c, ids.b, 2, 1);
  story.run('First (Mr Y)', '**First** story', ids.a, ids.b, 1, 1);
  story.run('Hidden', 'Hidden story', ids.a, ids.c, 0, 0);

  const snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.smileStories?.map((s) => [s.body, s.before.key, s.after.key]),
    [
      ['**First** story', `media/${ids.a}/v1/960.webp`, `media/${ids.b}/v1/960.webp`],
      ['Second story', `media/${ids.c}/v1/960.webp`, `media/${ids.b}/v1/960.webp`],
    ],
  );
  const text = JSON.stringify(snapshot.smileStories);
  assert.equal(text.includes('Mr Y') || text.includes('Mrs X'), false);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), []);
  // published slides replace the sample story, so the block needs no Page text decision for production
  assert.ok(!sampleSections(snapshot).some((m) => m.includes('smile transformation')));
});

test('no story, no smileStories; a picture without a description blocks the publish', async () => {
  const { raw, db } = setup();
  addPictures(raw);
  const empty = await buildSnapshot(db);
  assert.equal('smileStories' in empty, false);
  assert.ok(sampleSections(empty).some((m) => m.includes('smile transformation')));

  raw.prepare(insertStory).run('Story', 'Text', ids.a, ids.d, 0, 1);
  assert.deepEqual(snapshotProblems(await buildSnapshot(db)), [
    'Home: smile stories, slide 1: the after photo has no description. Add one in Media.',
  ]);
});

test('a snapshot with a malformed story is refused', () => {
  const image = {
    key: 'media/x/v1/960.webp',
    width: 960,
    height: 680,
    alt: 'x',
    decorative: false,
    widths: [960],
  };
  assert.equal(isSnapshot({ smileStories: [{ body: 'x', before: image, after: image }] }), true);
  assert.equal(isSnapshot({ smileStories: [{ before: image, after: image }] }), false);
  assert.equal(isSnapshot({ smileStories: {} }), false);
});

test('the story written in Page text before the slides becomes the first slide', () => {
  const { raw } = setup();
  addPictures(raw);
  raw.prepare("INSERT INTO pages (id, path, title) VALUES ('p1', '/', 'Home')").run();
  const section = raw.prepare(
    'INSERT INTO page_sections (page_id, type, is_visible, data) VALUES (?, ?, ?, ?)',
  );
  section.run(
    'p1',
    'home_smile',
    1,
    JSON.stringify({
      label: 'Smile transformations',
      title: 'Real Stories. Real Smiles.',
      summary: 'Gaps and discolouration.',
      detailsTitle: 'Treatment Details',
      details: ['Smile design', '20 restorations'],
      before: ids.a,
      after: ids.b,
    }),
  );
  // The migration has already run on the empty database; run its copy step again on this row.
  const migration = readFileSync(
    new URL('../db/migrations/0021_smile_stories.sql', import.meta.url),
    'utf8',
  );
  raw.exec(migration.slice(migration.indexOf('insert into smile_stories')));
  assert.deepEqual(
    raw
      .prepare('SELECT title, body, before_image_id, after_image_id FROM smile_stories')
      .all()
      .map((r) => ({ ...r })),
    [
      {
        title: 'Story from Page text',
        body: 'Gaps and discolouration.\n\n### Treatment Details\n- Smile design\n- 20 restorations',
        before_image_id: ids.a,
        after_image_id: ids.b,
      },
    ],
  );

  // a story without both pictures (or without text) is not copied
  raw.exec('DELETE FROM smile_stories; DELETE FROM page_sections;');
  section.run('p1', 'home_smile', 1, JSON.stringify({ summary: 'Text', before: ids.a }));
  raw.exec(migration.slice(migration.indexOf('insert into smile_stories')));
  assert.equal(
    (raw.prepare('SELECT count(*) AS n FROM smile_stories').get() as { n: number }).n,
    0,
  );
});
