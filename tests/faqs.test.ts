import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { buildSnapshot } from '../src/lib/snapshot.ts';
import { testDb } from './helpers/sqlite.ts';

test('website FAQs retain their independent list, with every answered, shown question in display order', async () => {
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

test('service FAQs stay with their service, filter drafts, and do not inherit website FAQs', async () => {
  const { raw, sql } = testDb();
  const db = createDb(sql);
  const addService = (slug: string, shown = 1) =>
    (
      raw
        .prepare('INSERT INTO services (slug, title, is_visible) VALUES (?, ?, ?) RETURNING id')
        .get(slug, slug, shown) as { id: string }
    ).id;
  const implants = addService('dental-implants');
  const veneers = addService('porcelain-veneers');
  addService('crowns');
  const hidden = addService('hidden', 0);
  raw
    .prepare(
      "INSERT INTO faqs (group_key, question, answer) VALUES ('services', 'Website question', 'Website answer')",
    )
    .run();
  const insert = raw.prepare(
    'INSERT INTO service_faqs (service_id, question, answer, sort_order, is_visible) VALUES (?, ?, ?, ?, ?)',
  );
  insert.run(implants, 'Second implant question', 'Second answer', 2, 1);
  insert.run(implants, 'First implant question', 'First answer', 1, 1);
  insert.run(veneers, 'Veneer question', 'Veneer answer', 1, 1);
  insert.run(implants, 'Hidden question', 'Hidden answer', 0, 0);
  insert.run(implants, 'Unanswered', null, 0, 1);
  insert.run(implants, 'Blank answer', ' \n\t ', 0, 1);
  insert.run(hidden, 'Hidden service question', 'Answer', 0, 1);

  let snapshot = await buildSnapshot(db);
  assert.deepEqual(
    snapshot.faqs?.map((f) => f.question),
    ['Website question'],
  );
  assert.deepEqual(snapshot.services?.find((s) => s.slug === 'dental-implants')?.faqs, [
    { question: 'First implant question', answer: 'First answer' },
    { question: 'Second implant question', answer: 'Second answer' },
  ]);
  assert.deepEqual(snapshot.services?.find((s) => s.slug === 'porcelain-veneers')?.faqs, [
    { question: 'Veneer question', answer: 'Veneer answer' },
  ]);
  assert.equal(snapshot.services?.find((s) => s.slug === 'crowns')?.faqs, undefined);
  assert.equal(
    snapshot.services?.some((s) => s.slug === 'hidden'),
    false,
  );

  // Renaming a service does not disconnect its FAQs.
  raw.prepare("UPDATE services SET slug = 'new-implant-address' WHERE id = ?").run(implants);
  snapshot = await buildSnapshot(db);
  assert.equal(snapshot.services?.find((s) => s.slug === 'new-implant-address')?.faqs?.length, 2);
  // Removing all its questions leaves no FAQ section, even though the website list still exists.
  raw.prepare('DELETE FROM service_faqs WHERE service_id = ?').run(implants);
  snapshot = await buildSnapshot(db);
  assert.equal(snapshot.services?.find((s) => s.slug === 'new-implant-address')?.faqs, undefined);
  raw.close();
});

test('service FAQs require a real service and protect it from accidental deletion', async () => {
  const { raw, sql } = testDb();
  const db = createDb(sql, { actorId: 'admin-1', audit: true });
  const { data: service } = await db
    .from('services')
    .insert({ slug: 'implants', title: 'Implants' })
    .select('id')
    .single();
  assert.ok(service);
  const { data: faq, error } = await db
    .from('service_faqs')
    .insert({
      service_id: service.id,
      question: 'Question',
      answer: 'Answer',
      is_visible: true,
    })
    .select('*')
    .single();
  assert.equal(error, null);
  assert.equal(faq?.is_visible, true);
  assert.ok(faq?.id);
  assert.ok(raw.prepare("SELECT id FROM audit_logs WHERE table_name = 'service_faqs'").get());
  assert.throws(
    () => raw.prepare('DELETE FROM services WHERE id = ?').run(service.id),
    /FOREIGN KEY/,
  );
  assert.throws(
    () =>
      raw
        .prepare('INSERT INTO service_faqs (service_id, question) VALUES (?, ?)')
        .run(crypto.randomUUID(), 'Q'),
    /FOREIGN KEY/,
  );
  assert.throws(
    () => raw.prepare('INSERT INTO service_faqs (question) VALUES (?)').run('Q'),
    /NOT NULL/,
  );
  assert.throws(
    () =>
      raw
        .prepare('INSERT INTO service_faqs (service_id, question) VALUES (?, ?)')
        .run(service.id, '  '),
    /CHECK/,
  );
  assert.throws(
    () =>
      raw
        .prepare('INSERT INTO service_faqs (service_id, question, answer) VALUES (?, ?, ?)')
        .run(service.id, 'Q', 'x'.repeat(4001)),
    /CHECK/,
  );
  raw
    .prepare(
      "UPDATE service_faqs SET created_at = '2020-01-01T00:00:00.000Z', updated_at = '2020-01-01T00:00:00.000Z' WHERE id = ?",
    )
    .run(faq!.id);
  raw.prepare("UPDATE service_faqs SET question = 'Edited' WHERE id = ?").run(faq!.id);
  const dates = raw
    .prepare('SELECT created_at, updated_at FROM service_faqs WHERE id = ?')
    .get(faq!.id);
  assert.notEqual(dates?.created_at, dates?.updated_at);
  await db.from('service_faqs').delete().eq('id', faq!.id);
  assert.equal((await db.from('services').delete().eq('id', service.id)).error, null);
  raw.close();
});

test('older service snapshots remain valid; malformed service FAQ data is rejected', async () => {
  const { isSnapshot } = await import('../src/lib/snapshot.ts');
  const service = { slug: 'implants', title: 'Implants', summary: null, image: null };
  const snapshot = {
    services: [service],
    faqs: [{ group: 'services', question: 'Old', answer: 'Old' }],
  };
  assert.equal(isSnapshot(snapshot), true);
  for (const faqs of [
    null,
    {},
    [null],
    [{ question: 'Q', answer: null }],
    [{ question: ' ', answer: 'A' }],
    [{ question: 'Q', answer: ' ' }],
  ]) {
    assert.equal(isSnapshot({ services: [{ ...service, faqs }] }), false);
  }
  assert.equal(
    isSnapshot({ services: [{ ...service, faqs: [{ question: 'Q', answer: 'A' }] }] }),
    true,
  );
});
