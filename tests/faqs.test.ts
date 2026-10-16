import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { buildSnapshot } from '../src/lib/snapshot.ts';
import { testDb } from './helpers/sqlite.ts';

test('the FAQs are one list: every answered, shown question in display order, whatever its old group', async () => {
  const { raw, sql } = testDb();
  const db = createDb(sql, { actorId: 'admin-1', audit: true });
  const faq = raw.prepare(
    'INSERT INTO faqs (group_key, question, answer, sort_order, is_visible) VALUES (?, ?, ?, ?, ?)',
  );
  faq.run('services', 'Third', 'c', 3, 1);
  faq.run('dental-implants', 'First', 'a', 1, 1);
  faq.run('porcelain-veneers', 'Second', 'b', 2, 1);
  faq.run('services', 'No answer yet', null, 0, 1);
  faq.run('services', 'Hidden', 'd', 0, 0);

  const snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.faqs?.map((f) => f.question),
    ['First', 'Second', 'Third'],
  );
});
