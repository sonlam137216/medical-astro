import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, toDbError } from '../src/lib/db.ts';
import { testDb } from './helpers/sqlite.ts';

const setup = (actorId: string | null = 'admin-1', audit = true) => {
  const { raw, sql } = testDb();
  return { raw, sql, db: createDb(sql, { actorId, audit }) };
};
const audit = (raw: ReturnType<typeof testDb>['raw']) =>
  raw
    .prepare('SELECT actor_id, action, table_name, row_id, changes FROM audit_logs ORDER BY id')
    .all() as {
    actor_id: string | null;
    action: string;
    table_name: string;
    row_id: string | null;
    changes: string | null;
  }[];

test('values come back as the code expects: booleans, arrays, objects', async () => {
  const { db } = setup();
  const { data, error } = await db
    .from('doctors')
    .insert({ slug: 'a', full_name: 'A', credentials: ['MD', 'PhD'], is_visible: false })
    .select('*')
    .single();
  assert.equal(error, null);
  assert.deepEqual(data?.credentials, ['MD', 'PhD']);
  assert.deepEqual(data?.languages, ['English']);
  assert.equal(data?.is_visible, false);
  assert.match(data!.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  const read = await db
    .from('doctors')
    .select('slug, is_visible, credentials')
    .eq('is_visible', false)
    .maybeSingle();
  assert.equal(read.data?.is_visible, false);
  assert.equal((await db.from('doctors').select('id').eq('is_visible', true)).data?.length, 0);
});

test('select: filters, order, range, count, head', async () => {
  const { db } = setup();
  for (const [i, n] of ['c', 'a', 'b', 'd'].entries()) {
    await db
      .from('faqs')
      .insert({ group_key: 'g', question: n, sort_order: i, answer: n === 'b' ? null : 'x' });
  }
  const ordered = await db.from('faqs').select('question').order('question', { ascending: false });
  assert.deepEqual(
    ordered.data?.map((r) => r.question),
    ['d', 'c', 'b', 'a'],
  );

  const page = await db
    .from('faqs')
    .select('question', { count: 'exact' })
    .order('sort_order')
    .range(1, 2);
  assert.deepEqual(
    page.data?.map((r) => r.question),
    ['a', 'b'],
  );
  assert.equal(page.count, 4);

  const head = await db
    .from('faqs')
    .select('id', { count: 'exact', head: true })
    .eq('question', 'a');
  assert.deepEqual([head.data, head.count], [[], 1]);

  const answered = await db
    .from('faqs')
    .select('question')
    .not('answer', 'is', null)
    .order('question');
  assert.deepEqual(
    answered.data?.map((r) => r.question),
    ['a', 'c', 'd'],
  );
  assert.equal((await db.from('faqs').select('question').eq('answer', null)).data?.length, 1);
  assert.equal(
    (await db.from('faqs').select('question').in('question', ['a', 'd'])).data?.length,
    2,
  );
  assert.equal((await db.from('faqs').select('question').in('question', [])).data?.length, 0);
  assert.equal((await db.from('faqs').select('question').limit(1)).data?.length, 1);
});

test('single and maybeSingle', async () => {
  const { db } = setup();
  await db.from('faqs').insert([
    { group_key: 'g', question: 'a' },
    { group_key: 'g', question: 'b' },
  ]);
  assert.equal((await db.from('faqs').select('*').eq('question', 'zz').maybeSingle()).data, null);
  assert.equal(
    (await db.from('faqs').select('*').eq('question', 'a').maybeSingle()).data?.question,
    'a',
  );
  assert.equal(
    (await db.from('faqs').select('*').eq('question', 'zz').single()).error?.code,
    'PGRST116',
  );
  assert.equal(
    (await db.from('faqs').select('*').maybeSingle()).error?.code,
    'PGRST116',
    'two rows',
  );
});

test('embedded relations: one image per doctor, null when there is none', async () => {
  const { db } = setup();
  const media = await db
    .from('media_assets')
    .insert({
      r2_key: 'k',
      kind: 'image',
      mime_type: 'image/webp',
      size_bytes: 1,
      width: 10,
      height: 20,
      variant_widths: [480, 960],
      alt_text: 'Alt',
    })
    .select('id')
    .single();
  await db
    .from('doctors')
    .insert({ slug: 'a', full_name: 'A', image_id: media.data!.id, sort_order: 1 });
  await db.from('doctors').insert({ slug: 'b', full_name: 'B', sort_order: 2 });
  const uneven = await db.from('faqs').insert([
    { group_key: 'g', question: 'a' },
    { group_key: 'g', question: 'b', answer: 'x' },
  ]);
  assert.match(uneven.error!.message, /same columns/);
  const { data } = await db
    .from('doctors')
    .select('slug, credentials, image:media_assets(r2_key, width, is_decorative, variant_widths)')
    .order('sort_order');
  assert.deepEqual(data?.[0].image, {
    r2_key: 'k',
    width: 10,
    is_decorative: false,
    variant_widths: [480, 960],
  });
  assert.equal(data?.[1].image, null);
  assert.deepEqual(data?.[0].credentials, []);
  assert.equal(data?.[0].id, undefined, 'only the requested columns');

  const rev = await db
    .from('content_revisions')
    .insert({ snapshot: {}, content_hash: 'a'.repeat(64) })
    .select('id')
    .single();
  await db.from('publish_jobs').insert({ revision_id: rev.data!.id });
  const jobs = await db.from('publish_jobs').select('status, content_revisions(revision_number)');
  assert.equal(jobs.data?.[0].content_revisions.revision_number, 1);

  const bad = await db.from('doctors').select('slug, x:pages(path)');
  assert.equal(bad.error?.code, 'D1');
});

test('writes: insert, update, delete, upsert', async () => {
  const { db } = setup();
  const created = await db
    .from('redirects')
    .insert({ from_path: '/a', to_path: '/b' })
    .select('id, status_code');
  assert.equal(created.data?.[0].status_code, 301);
  const id = created.data![0].id;

  const updated = await db
    .from('redirects')
    .update({ to_path: '/c', status_code: 302 })
    .eq('id', id)
    .select('to_path, status_code');
  assert.deepEqual(updated.data, [{ to_path: '/c', status_code: 302 }]);
  assert.deepEqual(
    (await db.from('redirects').update({ to_path: '/d' }).eq('id', 'nope').select('id')).data,
    [],
  );

  const site = {
    site_name: 'S',
    social_links: [{ platform: 'facebook', url: 'https://f.co' }],
    id: 1,
  };
  assert.equal((await db.from('site_settings').upsert(site, { onConflict: 'id' })).error, null);
  assert.equal(
    (await db.from('site_settings').upsert({ ...site, site_name: 'T' }, { onConflict: 'id' }))
      .error,
    null,
  );
  const row = await db.from('site_settings').select('*').maybeSingle();
  assert.deepEqual([row.data?.site_name, row.data?.social_links], ['T', site.social_links]);

  const pages = [
    { path: '/', title: 'Home' },
    { path: '/about', title: 'About' },
  ];
  await db.from('pages').upsert(pages, { onConflict: 'path', ignoreDuplicates: true });
  await db.from('pages').update({ title: 'Edited' }).eq('path', '/');
  await db.from('pages').upsert(pages, { onConflict: 'path', ignoreDuplicates: true });
  const kept = await db.from('pages').select('title').order('path');
  assert.deepEqual(
    kept.data?.map((p) => p.title),
    ['Edited', 'About'],
    'existing rows are kept',
  );

  assert.equal((await db.from('redirects').delete().eq('id', id)).error, null);
  assert.equal((await db.from('redirects').select('id')).data?.length, 0);
});

test('failures carry the familiar codes', async () => {
  const { db } = setup();
  await db.from('doctors').insert({ slug: 'a', full_name: 'A' });
  assert.equal(
    (await db.from('doctors').insert({ slug: 'a', full_name: 'B' })).error?.code,
    '23505',
  );
  assert.equal(
    (await db.from('doctors').insert({ slug: 'b', full_name: 'B', image_id: 'missing' })).error
      ?.code,
    '23503',
  );
  assert.equal(
    (await db.from('doctors').insert({ slug: 'Bad Slug', full_name: 'B' })).error?.code,
    '23514',
  );
  assert.equal((await db.from('doctors').insert({ slug: 'c' } as never)).error?.code, '23502');
  const rev = await db
    .from('content_revisions')
    .insert({ snapshot: {}, content_hash: 'a'.repeat(64) })
    .select('id')
    .single();
  assert.equal(
    (await db.from('content_revisions').update({ note: 'x' }).eq('id', rev.data!.id)).error?.code,
    'P0001',
  );

  assert.equal(toDbError(new Error('boom')).code, 'D1');
  assert.equal(
    toDbError(new Error('D1_ERROR: UNIQUE constraint failed: doctors.slug: SQLITE_CONSTRAINT'))
      .code,
    '23505',
  );
});

test('names and values never reach the SQL text', async () => {
  const { db, raw } = setup();
  const attacks = [
    () => db.from('doctors; DROP TABLE doctors' as never).select('*'),
    () => db.from('admins' as never).select('*'),
    () => db.from('doctors').select('slug; DROP TABLE doctors'),
    () => db.from('doctors').select('*').eq('slug" OR 1=1 --', 'x'),
    () => db.from('doctors').select('*').order('slug; --'),
    () =>
      db
        .from('doctors')
        .update({ 'full_name" = 1 --': 'x' } as never)
        .eq('id', 'x'),
  ];
  // Each of these fails loudly (as an exception or an error result) and the table is untouched.
  for (const attack of attacks) {
    const outcome = await Promise.resolve()
      .then(attack)
      .then(
        (r) => Boolean((r as { error?: unknown } | undefined)?.error),
        () => true,
      );
    assert.ok(outcome);
  }
  assert.ok(raw.prepare("SELECT 1 FROM sqlite_master WHERE name = 'doctors'").get());

  await db.from('doctors').insert({ slug: 'x', full_name: "Robert'); DROP TABLE doctors;--" });
  assert.equal(
    (await db.from('doctors').select('full_name').eq('slug', 'x').single()).data?.full_name,
    "Robert'); DROP TABLE doctors;--",
  );
  // Updates and deletes without a filter are refused rather than hitting every row.
  assert.ok(
    (
      await db
        .from('doctors')
        .update({ bio: 'x' })
        .then((r) => r)
    ).error,
  );
  assert.ok(
    (
      await db
        .from('doctors')
        .delete()
        .then((r) => r)
    ).error,
  );
  assert.equal((await db.from('doctors').select('id')).data?.length, 1);
});

test('audit log: who, what, old and new; no-ops and unaudited tables stay quiet', async () => {
  const { db, raw } = setup('admin-7');
  const doctor = await db
    .from('doctors')
    .insert({ slug: 'a', full_name: 'A', credentials: ['MD'] })
    .select('id')
    .single();
  const id = doctor.data!.id;
  await db.from('doctors').update({ full_name: 'A2', bio: null }).eq('id', id);
  await db.from('doctors').update({ full_name: 'A2' }).eq('id', id); // nothing changed
  await db.from('doctors').delete().eq('id', id);
  await db.from('doctor_services').select('*');

  const log = audit(raw);
  assert.deepEqual(
    log.map((l) => [l.action, l.table_name, l.row_id, l.actor_id]),
    [
      ['insert', 'doctors', id, 'admin-7'],
      ['update', 'doctors', id, 'admin-7'],
      ['delete', 'doctors', id, 'admin-7'],
    ],
  );
  assert.deepEqual(JSON.parse(log[1].changes!), {
    old: { full_name: 'A', bio: null },
    new: { full_name: 'A2', bio: null },
  });
  assert.equal(log[2].changes, null);

  const quiet = setup('x', false);
  await quiet.db.from('doctors').insert({ slug: 'a', full_name: 'A' });
  assert.equal(audit(quiet.raw).length, 0);
});

test('audit log never holds personal data from consultation requests', async () => {
  const { raw, sql } = setup();
  const form = createDb(sql, { actorId: null, audit: true });
  const inserted = await form
    .from('consultation_requests')
    .insert({
      submission_id: crypto.randomUUID(),
      full_name: 'Ann Visitor',
      phone: '+84 989 402 211',
      email: 'ann@example.com',
      source_path: '/services',
    })
    .select('id')
    .single();
  const id = inserted.data!.id;

  const admin = createDb(sql, { actorId: 'admin-1', audit: true });
  await admin
    .from('consultation_requests')
    .update({ status: 'in_progress', internal_note: 'called Ann on 0989', handled_by: null })
    .eq('id', id);
  await admin
    .from('consultation_requests')
    .update({ internal_note: 'second note', status: 'in_progress' })
    .eq('id', id);

  const log = audit(raw);
  assert.deepEqual(
    log.map((l) => [l.action, l.actor_id]),
    [
      ['insert', null],
      ['update', 'admin-1'],
    ],
    'a note-only change is not logged',
  );
  assert.deepEqual(JSON.parse(log[1].changes!), {
    old: { status: 'new' },
    new: { status: 'in_progress' },
  });
  const dump = JSON.stringify(log);
  for (const secret of ['Ann', 'ann@example.com', '0989', '989 402', 'note']) {
    assert.ok(!dump.includes(secret), `audit log must not contain ${secret}`);
  }
});

test('a failed change leaves no audit row (one atomic batch)', async () => {
  const { db, raw } = setup();
  await db.from('doctors').insert({ slug: 'a', full_name: 'A' });
  const before = audit(raw).length;
  const clash = await db.from('doctors').insert({ slug: 'a', full_name: 'B' });
  assert.equal(clash.error?.code, '23505');
  const rev = await db
    .from('content_revisions')
    .insert({ snapshot: {}, content_hash: 'a'.repeat(64) })
    .select('id')
    .single();
  await db.from('content_revisions').update({ note: 'n' }).eq('id', rev.data!.id);
  const after = audit(raw).filter((l) => l.table_name === 'doctors');
  assert.equal(after.length, before);
  assert.deepEqual(
    audit(raw).map((l) => l.action),
    ['insert', 'insert'],
    'only the two successful inserts',
  );
});

test('statements are limited to 100 bound parameters (a D1 limit) with a clear error', async () => {
  const { db } = setup();
  const rows = Array.from({ length: 60 }, (_, i) => ({ from_path: `/a${i}`, to_path: '/b' }));
  const result = await db.from('redirects').insert(rows);
  assert.match(result.error!.message, /too many bound parameters/);
});
