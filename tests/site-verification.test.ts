import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { buildSnapshot, isSnapshot } from '../src/lib/snapshot.ts';
import {
  VERIFICATION_ENGINES,
  normalizeVerificationFields,
  parseVerificationToken,
  verificationMeta,
} from '../src/lib/site-verification.ts';
import { testDb } from './helpers/sqlite.ts';

const [google, bing] = VERIFICATION_ENGINES;
const GOOGLE = 'aBcD1234_efGH-5678ijKLmnop90qrSTuvWXyz12345';
const BING = '0123456789ABCDEF0123456789ABCDEF';

const parse = (raw: string, engine = google) => parseVerificationToken(raw, engine);

test('verification: the code alone, or the whole tag reduced to its code', () => {
  assert.deepEqual(parse(''), { ok: true, value: null });
  assert.deepEqual(parse('   '), { ok: true, value: null });
  assert.deepEqual(parse(` ${GOOGLE} `), { ok: true, value: GOOGLE });
  assert.deepEqual(parse(`"${GOOGLE}"`), { ok: true, value: GOOGLE });
  for (const tag of [
    `<meta name="google-site-verification" content="${GOOGLE}" />`,
    `<meta name="google-site-verification" content="${GOOGLE}">`,
    `<META NAME='Google-Site-Verification' CONTENT='${GOOGLE}'/>`,
    `<meta content="${GOOGLE}" name="google-site-verification">`,
  ]) {
    assert.deepEqual(parse(tag), { ok: true, value: GOOGLE }, tag);
  }
  assert.deepEqual(parse(`<meta name="msvalidate.01" content="${BING}" />`, bing), {
    ok: true,
    value: BING,
  });
});

test('verification: a tag of the other engine, another tag or a bad code is refused', () => {
  const error = (raw: string, engine = google) => {
    const result = parse(raw, engine);
    assert.equal(result.ok, false, raw);
    return result.ok ? '' : result.error;
  };
  assert.match(
    error(`<meta name="msvalidate.01" content="${BING}" />`),
    /This is the Bing tag. Paste it in the Bing box/,
  );
  assert.match(
    error(`<meta name="google-site-verification" content="${GOOGLE}" />`, bing),
    /This is the Google tag/,
  );
  assert.match(
    error(`<meta name="description" content="${GOOGLE}">`),
    /name="google-site-verification"/,
  );
  assert.match(error(`<meta content="${GOOGLE}">`), /not the Google tag/);
  assert.match(error('<script>alert(1)</script>'), /Paste the <meta/);
  assert.match(
    error(`<meta name="google-site-verification" content="${GOOGLE}"><script>`),
    /Paste the <meta/,
  );
  for (const bad of [
    'short',
    'x'.repeat(129),
    `${GOOGLE}" /><script>`,
    'has spaces in the code',
    'google1234567890abcdef.html',
    `<meta name="google-site-verification" content="" />`,
    `<meta name="google-site-verification" content="a&quot;b12345678" />`,
  ]) {
    assert.match(error(bad), /content="…"/, bad);
  }
});

test('verification: tokens go into the snapshot only when set, and give the Home page tags', async () => {
  const { raw, sql } = testDb();
  const db = createDb(sql, { actorId: 'admin-1', audit: true });
  raw.prepare('INSERT INTO site_settings (id, site_name) VALUES (1, ?)').run('Melatec');

  const without = await buildSnapshot(db);
  assert.equal('verification' in (without.site ?? {}), false); // old hashes stay the same
  assert.deepEqual(verificationMeta(without.site?.verification), []);

  raw.prepare('UPDATE site_settings SET google_site_verification = ? WHERE id = 1').run(GOOGLE);
  const one = await buildSnapshot(db);
  assert.deepEqual(one.site?.verification, { google: GOOGLE });
  assert.ok(isSnapshot(JSON.parse(JSON.stringify(one))));

  raw.prepare('UPDATE site_settings SET bing_site_verification = ? WHERE id = 1').run(BING);
  const both = await buildSnapshot(db);
  assert.deepEqual(both.site?.verification, { google: GOOGLE, bing: BING });
  assert.deepEqual(verificationMeta(both.site?.verification), [
    { name: 'google-site-verification', content: GOOGLE },
    { name: 'msvalidate.01', content: BING },
  ]);

  // The CHECK keeps the token shape, and a hand-edited snapshot with a bad one is not accepted.
  for (const bad of ['short', `${GOOGLE}"><script>`, 'with spaces in it']) {
    assert.throws(
      () =>
        raw.prepare('UPDATE site_settings SET google_site_verification = ? WHERE id = 1').run(bad),
      /CHECK/,
      bad,
    );
  }
  const site = both.site!;
  for (const verification of [
    { google: '"><script>' },
    { yandex: GOOGLE },
    { google: 42 },
    'token',
    [GOOGLE],
  ]) {
    assert.equal(
      isSnapshot({ ...both, site: { ...site, verification } }),
      false,
      JSON.stringify(verification),
    );
  }
});

test('Site details: the form keeps the code of a pasted tag; a wrong tag leaves the form as it was', () => {
  const pasted: Record<string, unknown> = {
    site_name: 'Melatec',
    google_site_verification: `<meta name="google-site-verification" content="${GOOGLE}" />`,
    bing_site_verification: BING,
  };
  assert.deepEqual(normalizeVerificationFields(pasted), {});
  assert.deepEqual(pasted, {
    site_name: 'Melatec',
    google_site_verification: GOOGLE,
    bing_site_verification: BING,
  });

  const empty: Record<string, unknown> = { google_site_verification: null };
  assert.deepEqual(normalizeVerificationFields(empty), {});
  assert.deepEqual(empty, { google_site_verification: null, bing_site_verification: null });

  const swapped: Record<string, unknown> = {
    google_site_verification: `<meta name="msvalidate.01" content="${BING}" />`,
    bing_site_verification: `<meta name="msvalidate.01" content="${BING}" />`,
  };
  const before = { ...swapped };
  const errors = normalizeVerificationFields(swapped);
  assert.deepEqual(Object.keys(errors), ['google_site_verification']);
  assert.match(errors.google_site_verification, /Bing tag/);
  assert.deepEqual(swapped, before);
});
