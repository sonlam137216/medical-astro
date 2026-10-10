import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb } from '../src/lib/db.ts';
import { BUILTIN_PAGES } from '../src/lib/cms/pages.ts';
import { buildSnapshot, isSnapshot, snapshotProblems } from '../src/lib/snapshot.ts';
import { testDb } from './helpers/sqlite.ts';

// db/seed.sql is the starting content for the admin to edit. It must load on the real schema, be safe to run
// again, and give a snapshot that can be published.
const seed = readFileSync(new URL('../db/seed.sql', import.meta.url), 'utf8');

const count = (raw: ReturnType<typeof testDb>['raw'], table: string) =>
  (raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

test('the seed loads, can be run again, and never invents prices or text sections', () => {
  const { raw } = testDb();
  raw.exec(seed);
  raw.exec(seed);
  assert.equal(count(raw, 'site_settings'), 1);
  assert.equal(count(raw, 'navigation_items'), 19);
  assert.equal(count(raw, 'locations'), 3);
  assert.equal(count(raw, 'doctors'), 4);
  assert.equal(count(raw, 'services'), 5);
  assert.equal(count(raw, 'packages'), 3);
  assert.equal(count(raw, 'faqs'), 4);
  assert.equal(count(raw, 'pages'), BUILTIN_PAGES.length);
  assert.equal(count(raw, 'page_sections'), 0);
  assert.equal(count(raw, 'packages WHERE price_amount IS NOT NULL'), 0);
  assert.equal(count(raw, "services WHERE price_text IS NOT NULL OR inclusions <> '[]'"), 0);
  assert.equal(count(raw, 'faqs WHERE answer IS NOT NULL'), 0);
});

test('a snapshot of the seed can be published to staging; production still waits for the page text', async () => {
  const { raw, sql } = testDb();
  raw.exec(seed);
  const snapshot = await buildSnapshot(createDb(sql, { actorId: 'admin-1', audit: true }));
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.equal(snapshot.services?.length, 5);
  assert.equal(snapshot.packages?.[0].service, 'dental-implants');
  assert.equal(snapshot.faqs, undefined); // unanswered questions are not published
  assert.deepEqual(snapshotProblems(snapshot, 'staging'), []);
  const production = snapshotProblems(snapshot, 'production');
  assert.ok(production.length > 0);
  assert.ok(
    production.every((p) => p.startsWith('Page text:') || p.startsWith('Travel destinations')),
  );
});
