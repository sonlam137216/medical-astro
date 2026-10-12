import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { buildSnapshot, isSnapshot, snapshotProblems } from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

const setup = () => {
  const { raw, sql } = testDb();
  return { raw, db: createDb(sql, { actorId: 'admin-1', audit: true }) };
};

test('only shown legal pages that have text reach the snapshot', async () => {
  const { raw, db } = setup();
  const insert = raw.prepare(
    'INSERT INTO legal_pages (slug, title, body, is_visible) VALUES (?, ?, ?, ?)',
  );
  insert.run(
    'privacy-policy',
    'Privacy Policy',
    '## What we collect\n\nYour name and phone number.',
    1,
  );
  insert.run('legal-disclaimer', 'Legal Disclaimer', '   ', 1);
  assert.deepEqual(
    (await buildSnapshot(db)).legalPages?.map((p) => p.slug),
    ['privacy-policy'],
  );

  raw.prepare("UPDATE legal_pages SET is_visible = 0 WHERE slug = 'privacy-policy'").run();
  assert.equal((await buildSnapshot(db)).legalPages, undefined);
});

test('the snapshot with legal pages reads back and passes the checks', async () => {
  const { raw, db } = setup();
  raw
    .prepare(
      "INSERT INTO legal_pages (slug, title, body) VALUES ('privacy-policy', 'Privacy', 'Text.')",
    )
    .run();
  const snapshot = await buildSnapshot(db);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), []);
});

test('pictures in a legal page stop the publish', async () => {
  const { raw, db } = setup();
  raw
    .prepare(
      "INSERT INTO legal_pages (slug, title, body) VALUES ('privacy-policy', 'Privacy', '![logo](media:11111111-1111-4111-8111-111111111111)')",
    )
    .run();
  const problems = snapshotProblems(await buildSnapshot(db));
  assert.ok(problems.some((p) => p.includes('Privacy') && p.includes('pictures')));
});

test('the database allows only the two legal addresses, once each', () => {
  const { raw } = setup();
  assert.match(
    failure(raw, "INSERT INTO legal_pages (slug, title) VALUES ('about', 'About')"),
    /CHECK/,
  );
  raw.prepare("INSERT INTO legal_pages (slug, title) VALUES ('privacy-policy', 'Privacy')").run();
  assert.match(
    failure(raw, "INSERT INTO legal_pages (slug, title) VALUES ('privacy-policy', 'Again')"),
    /UNIQUE/,
  );
});
