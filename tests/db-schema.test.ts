import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABLES } from '../src/lib/db-schema.ts';
import { failure, testDb } from './helpers/sqlite.ts';

// What the pgTAP tests of the old Supabase schema covered, now on the D1 (SQLite) schema.

const uuid = () => crypto.randomUUID();
const sha = 'a'.repeat(64);

test('the registry, the row types and the migrations describe the same tables and columns', () => {
  const { raw } = testDb();
  const tables = (
    raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as {
      name: string;
    }[]
  ).map((t) => t.name);
  // admins and admin_sessions are reached only by admin-auth.ts, so they are not in the registry.
  assert.deepEqual(
    tables.filter((t) => !['admins', 'admin_sessions'].includes(t)).sort(),
    Object.keys(TABLES).sort(),
  );

  const source = readFileSync(new URL('../src/lib/db-schema.ts', import.meta.url), 'utf8');
  for (const [name, info] of Object.entries(TABLES)) {
    const columns = (
      raw.prepare(`PRAGMA table_info(${name})`).all() as { name: string; type: string }[]
    ).sort((a, b) => a.name.localeCompare(b.name));
    const block = new RegExp(`^  ${name}: \\{\\n    Row: \\{\\n([\\s\\S]*?)\\n    \\};`, 'm').exec(
      source,
    );
    assert.ok(block, `${name} has a Row type`);
    const typed = [...block[1].matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort();
    assert.deepEqual(
      typed,
      columns.map((c) => c.name),
      `${name}: Row type matches the columns`,
    );
    for (const c of info.bool ?? []) {
      assert.equal(
        columns.find((x) => x.name === c)?.type,
        'INTEGER',
        `${name}.${c} is a 0/1 column`,
      );
    }
    for (const c of info.json ?? [])
      assert.ok(
        columns.some((x) => x.name === c),
        `${name}.${c} exists`,
      );
  }
});

test('shape checks: slugs, paths, links and emails', () => {
  const { raw } = testDb();
  const slug = (s: string) =>
    failure(raw, 'INSERT INTO doctors (slug, full_name) VALUES (?, ?)', s, 'X');
  assert.equal(slug('dr-a-1'), '');
  for (const bad of ['', 'Dr-A', 'a--b', '-a', 'a-', 'a b', 'a/b', 'a'.repeat(101)]) {
    assert.match(slug(bad), /CHECK constraint failed/, `slug ${JSON.stringify(bad)}`);
  }

  const path = (p: string) => failure(raw, 'INSERT INTO pages (path, title) VALUES (?, ?)', p, 'T');
  for (const ok of ['/', '/about', '/services/dental-implants']) assert.equal(path(ok), '');
  for (const bad of ['about', '/About', '/a//b', '/a/', '/a--b', 'https://x.com', '/a b']) {
    assert.match(path(bad), /CHECK constraint failed/, `path ${bad}`);
  }

  const href = (h: string) =>
    failure(
      raw,
      "INSERT INTO navigation_items (location, label, href) VALUES ('header', 'L', ?)",
      h,
    );
  for (const ok of [
    '/',
    '/x',
    '#consultation',
    'https://a.com',
    'http://a.com',
    'mailto:a@b.co',
    'tel:+84',
  ]) {
    assert.equal(href(ok), '', ok);
  }
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x', 'x.com', '']) {
    assert.match(href(bad), /CHECK constraint failed/, bad);
  }

  const request = (email: string) =>
    failure(
      raw,
      "INSERT INTO consultation_requests (submission_id, full_name, phone, email) VALUES (?, 'N', '12345', ?)",
      uuid(),
      email,
    );
  assert.equal(request('a@b.co'), '');
  for (const bad of ['a', 'a@b', '@b.co', 'a b@c.co', 'a@b .co']) {
    assert.match(request(bad), /CHECK constraint failed/, bad);
  }
});

test('consultation requests: required fields, one row per submission, status values', () => {
  const { raw } = testDb();
  const insert = (over: Record<string, unknown> = {}) => {
    const row = {
      submission_id: uuid(),
      full_name: 'Ann',
      phone: '+84 989 402 211',
      email: 'a@b.co',
      ...over,
    };
    const keys = Object.keys(row);
    return failure(
      raw,
      `INSERT INTO consultation_requests (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
      ...Object.values(row),
    );
  };
  assert.equal(insert(), '');
  const id = uuid();
  assert.equal(insert({ submission_id: id }), '');
  assert.match(insert({ submission_id: id }), /UNIQUE constraint failed/);
  assert.match(insert({ full_name: '   ' }), /CHECK/);
  assert.match(insert({ phone: '123' }), /CHECK/);
  assert.match(insert({ status: 'closed' }), /CHECK/);
  assert.match(insert({ client_country: 'vn' }), /CHECK/);
  assert.equal(insert({ client_country: 'VN', source_path: '/services' }), '');
  assert.match(insert({ source_path: 'services' }), /CHECK/);
});

test('content_revisions are immutable and numbered without reuse', () => {
  const { raw } = testDb();
  const add = () =>
    raw
      .prepare(
        "INSERT INTO content_revisions (snapshot, content_hash) VALUES ('{}', ?) RETURNING id, revision_number",
      )
      .get(sha) as { id: string; revision_number: number };
  const a = add();
  const b = add();
  assert.equal(b.revision_number, a.revision_number + 1);

  assert.match(
    failure(raw, "UPDATE content_revisions SET note = 'x' WHERE id = ?", a.id),
    /immutable/,
  );
  assert.match(failure(raw, 'DELETE FROM content_revisions WHERE id = ?', a.id), /immutable/);
  assert.match(
    failure(raw, "INSERT INTO content_revisions (snapshot, content_hash) VALUES ('[]', ?)", sha),
    /CHECK/,
  );
  assert.match(
    failure(raw, "INSERT INTO content_revisions (snapshot, content_hash) VALUES ('{}', 'xyz')"),
    /CHECK/,
  );
  assert.match(
    failure(
      raw,
      "INSERT INTO content_revisions (snapshot, content_hash) VALUES ('not json', ?)",
      sha,
    ),
    /CHECK|malformed/,
  );
  assert.equal(
    (raw.prepare('SELECT COUNT(*) n FROM content_revisions').get() as { n: number }).n,
    2,
  );
});

test('publish_jobs: one building, one queued, consistent timestamps, live revision', () => {
  const { raw } = testDb();
  const rev = (
    raw
      .prepare(
        "INSERT INTO content_revisions (snapshot, content_hash) VALUES ('{}', ?) RETURNING id",
      )
      .get(sha) as { id: string }
  ).id;
  const job = (sql: string, ...p: unknown[]) =>
    failure(raw, `INSERT INTO publish_jobs (revision_id, ${sql}`, rev, ...p);

  assert.equal(job("status) VALUES (?, 'queued')"), '');
  assert.match(
    job("status) VALUES (?, 'queued')"),
    /UNIQUE constraint failed/,
    'second waiting job',
  );
  assert.equal(job("status, started_at) VALUES (?, 'building', '2026-10-05T10:00:00.000Z')"), '');
  assert.match(
    job("status, started_at) VALUES (?, 'building', '2026-10-05T10:00:00.000Z')"),
    /UNIQUE constraint failed/,
    'second running job',
  );
  assert.equal(job("status) VALUES (?, 'superseded')"), '');
  assert.equal(job("status) VALUES (?, 'superseded')"), '', 'history can hold many');

  assert.match(job("status) VALUES (?, 'building')"), /CHECK|UNIQUE/, 'building needs started_at');
  assert.match(job("status) VALUES (?, 'deployed')"), /CHECK/, 'deployed needs finished_at');
  assert.match(job("status) VALUES (?, 'failed')"), /CHECK/, 'failed needs an error');
  assert.match(job("status) VALUES (?, 'done')"), /CHECK/);
  assert.match(
    failure(raw, "INSERT INTO publish_jobs (revision_id, status) VALUES ('missing', 'superseded')"),
    /FOREIGN KEY/,
  );

  // The queued job moves on; "live" is only what actually deployed.
  assert.equal((raw.prepare('SELECT COUNT(*) n FROM live_revision').get() as { n: number }).n, 0);
  raw
    .prepare(
      "UPDATE publish_jobs SET status = 'deployed', finished_at = '2026-10-05T10:05:00.000Z' WHERE status = 'building'",
    )
    .run();
  assert.equal((raw.prepare('SELECT id FROM live_revision').get() as { id: string }).id, rev);
});

test('foreign keys: images in use cannot be deleted, children follow their parents', () => {
  const { raw } = testDb();
  const media = (
    raw
      .prepare(
        "INSERT INTO media_assets (r2_key, kind, mime_type, size_bytes) VALUES ('k', 'image', 'image/webp', 1) RETURNING id",
      )
      .get() as { id: string }
  ).id;
  raw.prepare("INSERT INTO doctors (slug, full_name, image_id) VALUES ('a', 'A', ?)").run(media);
  assert.match(failure(raw, 'DELETE FROM media_assets WHERE id = ?', media), /FOREIGN KEY/);
  assert.match(
    failure(raw, "INSERT INTO doctors (slug, full_name, image_id) VALUES ('b', 'B', 'nope')"),
    /FOREIGN KEY/,
  );

  const page = (
    raw.prepare("INSERT INTO pages (path, title) VALUES ('/x', 'X') RETURNING id").get() as {
      id: string;
    }
  ).id;
  raw.prepare("INSERT INTO page_sections (page_id, type) VALUES (?, 'hero')").run(page);
  assert.match(
    failure(raw, "INSERT INTO page_sections (page_id, type) VALUES (?, 'Bad Type')", page),
    /CHECK/,
  );
  raw.prepare('DELETE FROM pages WHERE id = ?').run(page);
  assert.equal((raw.prepare('SELECT COUNT(*) n FROM page_sections').get() as { n: number }).n, 0);

  // Removing an admin keeps what they published and requested.
  const admin = (
    raw
      .prepare("INSERT INTO admins (email, password_hash) VALUES ('a@b.co', ?) RETURNING id")
      .get('x'.repeat(40)) as { id: string }
  ).id;
  const rev = (
    raw
      .prepare(
        "INSERT INTO content_revisions (snapshot, content_hash, created_by) VALUES ('{}', ?, ?) RETURNING id",
      )
      .get(sha, admin) as { id: string }
  ).id;
  raw.prepare('INSERT INTO publish_jobs (revision_id, requested_by) VALUES (?, ?)').run(rev, admin);
  raw.prepare('DELETE FROM admins WHERE id = ?').run(admin);
  assert.equal(
    (raw.prepare('SELECT requested_by FROM publish_jobs').get() as { requested_by: unknown })
      .requested_by,
    null,
  );
});

test('single-row and value rules', () => {
  const { raw } = testDb();
  assert.equal(failure(raw, "INSERT INTO site_settings (site_name) VALUES ('Melatec')"), '');
  assert.match(
    failure(raw, "INSERT INTO site_settings (site_name) VALUES ('Again')"),
    /CHECK|UNIQUE/,
  );
  assert.match(
    failure(raw, "INSERT INTO site_settings (id, site_name) VALUES (2, 'Other')"),
    /CHECK/,
  );

  assert.match(
    failure(raw, "INSERT INTO redirects (from_path, to_path) VALUES ('/a', '/a')"),
    /CHECK/,
  );
  assert.match(
    failure(
      raw,
      "INSERT INTO redirects (from_path, to_path, status_code) VALUES ('/a', '/b', 307)",
    ),
    /CHECK/,
  );
  assert.equal(failure(raw, "INSERT INTO redirects (from_path, to_path) VALUES ('/a', '/b')"), '');

  assert.match(
    failure(
      raw,
      "INSERT INTO packages (slug, kind, title, price_amount) VALUES ('p', 'travel_combo', 'P', 10)",
    ),
    /CHECK/,
    'a price needs a currency',
  );
  assert.equal(
    failure(
      raw,
      "INSERT INTO packages (slug, kind, title, price_amount, currency) VALUES ('p', 'travel_combo', 'P', 10, 'USD')",
    ),
    '',
  );
  assert.match(
    failure(raw, "INSERT INTO packages (slug, kind, title) VALUES ('q', 'bundle', 'Q')"),
    /CHECK/,
  );

  assert.match(
    failure(
      raw,
      "INSERT INTO media_assets (r2_key, kind, mime_type, size_bytes, variant_widths) VALUES ('a', 'image', 'image/webp', 1, '{}')",
    ),
    /CHECK/,
  );
  assert.match(
    failure(
      raw,
      "INSERT INTO media_assets (r2_key, kind, mime_type, size_bytes, is_decorative) VALUES ('b', 'image', 'image/webp', 1, 2)",
    ),
    /CHECK/,
  );
  assert.match(
    failure(raw, "INSERT INTO doctors (slug, full_name, credentials) VALUES ('c', 'C', 'oops')"),
    /CHECK|malformed/,
  );
});

test('updated_at moves forward on every update', async () => {
  const { raw } = testDb();
  raw
    .prepare(
      "INSERT INTO faqs (group_key, question, created_at, updated_at) VALUES ('g', 'Q', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')",
    )
    .run();
  raw.prepare("UPDATE faqs SET question = 'Q2'").run();
  const row = raw.prepare('SELECT created_at, updated_at FROM faqs').get() as {
    created_at: string;
    updated_at: string;
  };
  assert.equal(row.created_at, '2020-01-01T00:00:00.000Z');
  assert.ok(row.updated_at > row.created_at);
  assert.match(row.updated_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
});

test('admins: unique case-insensitive email, sessions follow the account', () => {
  const { raw } = testDb();
  const add = (email: string) =>
    failure(raw, 'INSERT INTO admins (email, password_hash) VALUES (?, ?)', email, 'h'.repeat(40));
  assert.equal(add('Boss@Example.com'), '');
  assert.match(add('boss@example.com'), /UNIQUE/);
  assert.match(add('nope'), /CHECK/);
  const admin = (raw.prepare('SELECT id FROM admins').get() as { id: string }).id;
  raw
    .prepare(
      "INSERT INTO admin_sessions (admin_id, token_hash, expires_at) VALUES (?, ?, '2030-01-01T00:00:00.000Z')",
    )
    .run(admin, sha);
  assert.match(
    failure(
      raw,
      "INSERT INTO admin_sessions (admin_id, token_hash, expires_at) VALUES (?, 'short', '2030-01-01T00:00:00.000Z')",
      admin,
    ),
    /CHECK/,
  );
  raw.prepare('DELETE FROM admins').run();
  assert.equal((raw.prepare('SELECT COUNT(*) n FROM admin_sessions').get() as { n: number }).n, 0);
});
