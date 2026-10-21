import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { buildSnapshot, isSnapshot, snapshotProblems } from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

const setup = () => {
  const { raw, sql } = testDb();
  return { raw, db: createDb(sql, { actorId: 'admin-1', audit: true }) };
};

const PIC = '3f2b8c1e-7a4d-4b6e-9c10-2d5e8f7a9b01';

function insertImage(raw: ReturnType<typeof testDb>['raw'], id: string, alt: string | null) {
  raw
    .prepare(
      "INSERT INTO media_assets (id, r2_key, kind, mime_type, size_bytes, width, height, variant_widths, alt_text) VALUES (?, ?, 'image', 'image/webp', 1, 480, 300, '[480]', ?)",
    )
    .run(id, `media/${id}/v1/480.webp`, alt);
}

// ---- floating contact buttons ------------------------------------------------------------------------------

test('contact buttons: Zalo link (http/https only) and the switch, in the snapshot only when they differ', async () => {
  const { raw, db } = setup();
  assert.match(
    failure(
      raw,
      "INSERT INTO site_settings (id, site_name, zalo_url) VALUES (1, 'M', 'zalo.me/1')",
    ),
    /CHECK/,
  );
  assert.match(
    failure(raw, "INSERT INTO site_settings (id, site_name, contact_buttons) VALUES (1, 'M', 2)"),
    /CHECK/,
  );
  raw.prepare("INSERT INTO site_settings (id, site_name) VALUES (1, 'Melatec')").run();

  // Defaults: buttons on, no Zalo: the site part keeps its old shape (and hash).
  let snapshot = await buildSnapshot(db);
  assert.equal('zaloUrl' in (snapshot.site ?? {}), false);
  assert.equal('contactButtons' in (snapshot.site ?? {}), false);

  raw
    .prepare(
      "UPDATE site_settings SET zalo_url = 'https://zalo.me/84900000000', contact_buttons = 0",
    )
    .run();
  snapshot = await buildSnapshot(db);
  assert.equal(snapshot.site?.zaloUrl, 'https://zalo.me/84900000000');
  assert.equal(snapshot.site?.contactButtons, false);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.equal(
    isSnapshot({ ...snapshot, site: { ...snapshot.site, zaloUrl: 'javascript:alert(1)' } }),
    false,
  );
  assert.equal(
    isSnapshot({ ...snapshot, site: { ...snapshot.site, contactButtons: true } }),
    false,
  );
});

// ---- service guides -----------------------------------------------------------------------------------------

test('service guide: carried by the snapshot with its pictures, only when written', async () => {
  const { raw, db } = setup();
  insertImage(raw, PIC, 'An implant model');
  const insert = raw.prepare(
    'INSERT INTO services (slug, title, guide_body, sort_order) VALUES (?, ?, ?, ?)',
  );
  insert.run(
    'dental-implants',
    'Dental Implants',
    `## Before you fly\n\n![](media:${PIC})\n\n- Rest`,
    1,
  );
  insert.run('veneers', 'Porcelain Veneers', null, 2);
  insert.run('crowns', 'Dental Crowns', '   ', 3);
  assert.match(
    failure(raw, 'INSERT INTO services (slug, title, guide_body) VALUES (?, ?, ?)', 'x', 'X', ''),
    /CHECK/,
  );
  assert.match(
    failure(
      raw,
      'INSERT INTO services (slug, title, guide_body) VALUES (?, ?, ?)',
      'y',
      'Y',
      'a'.repeat(20_001),
    ),
    /CHECK/,
  );

  const snapshot = await buildSnapshot(db);
  const [implants, veneers, crowns] = snapshot.services ?? [];
  assert.equal(implants.guide?.body.startsWith('## Before you fly'), true);
  assert.equal(implants.guide?.bodyImages?.[PIC]?.alt, 'An implant model');
  assert.equal('guide' in veneers, false);
  assert.equal('guide' in crowns, false);
  assert.equal(isSnapshot(JSON.parse(JSON.stringify(snapshot))), true);
  assert.deepEqual(snapshotProblems(snapshot), []);
  assert.equal(isSnapshot({ ...snapshot, services: [{ ...implants, guide: { body: 3 } }] }), false);
});

test('service guide: a missing or undescribed picture blocks publishing', async () => {
  const { raw, db } = setup();
  insertImage(raw, PIC, null);
  const other = '4a2b8c1e-7a4d-4b6e-9c10-2d5e8f7a9b02';
  raw
    .prepare('INSERT INTO services (slug, title, guide_body) VALUES (?, ?, ?)')
    .run('dental-implants', 'Dental Implants', `![](media:${PIC})\n\n![](media:${other})`);
  const problems = snapshotProblems(await buildSnapshot(db));
  assert.equal(problems.length, 2);
  assert.match(problems[0], /Dental Implants.*no description/);
  assert.match(problems[1], /Dental Implants.*no longer in Media/);
});

test('service guide: the guide text is kept out of the audit log', async () => {
  const { raw, db } = setup();
  const { error } = await db
    .from('services')
    .insert({ slug: 'audited', title: 'Audited', guide_body: 'SECRET GUIDE TEXT' });
  assert.equal(error, null);
  const rows = raw
    .prepare("SELECT changes FROM audit_logs WHERE table_name = 'services'")
    .all() as { changes: string | null }[];
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => !String(r.changes).includes('SECRET GUIDE TEXT')));
});
