import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { buildSnapshot, isSnapshot } from '../src/lib/snapshot.ts';
import {
  normalizeGoogleAdsFields,
  googleAdsContactAction,
  googleAdsPageLocation,
  isGoogleAdsConfig,
} from '../src/lib/google-ads.ts';
import { testDb } from './helpers/sqlite.ts';

test('Google Ads: only IDs and labels are accepted; empty ID disables it', () => {
  const row: Record<string, unknown> = {
    google_ads_id: ' AW-123456789 ',
    google_ads_phone_label: ' Phone_123-a ',
  };
  assert.deepEqual(normalizeGoogleAdsFields(row), {});
  assert.equal(row.google_ads_id, 'AW-123456789');
  assert.equal(row.google_ads_phone_label, 'Phone_123-a');
  assert.equal(row.google_ads_consultation_label, null);
  for (const bad of [
    'G-123456',
    'GTM-123',
    '<script>alert(1)</script>',
    'AW-123/x',
    'AW-',
    'AW-12"',
  ]) {
    assert.ok(normalizeGoogleAdsFields({ google_ads_id: bad }).google_ads_id, bad);
  }
  assert.deepEqual(normalizeGoogleAdsFields({ google_ads_phone_label: 'Label' }), {});
  assert.ok(
    normalizeGoogleAdsFields({ google_ads_id: 'AW-123', google_ads_phone_label: 'AW-123/Label' })
      .google_ads_phone_label,
  );
  const empty: Record<string, unknown> = {};
  assert.deepEqual(normalizeGoogleAdsFields(empty), {});
  assert.equal(empty.google_ads_id, null);
});

test('Google Ads: DB → published snapshot, old snapshots and rejected unsafe settings', async () => {
  const { raw, sql } = testDb();
  raw.prepare("INSERT INTO site_settings (id, site_name) VALUES (1, 'Melatec')").run();
  const db = createDb(sql, { actorId: null, audit: false });
  const disabled = await buildSnapshot(db);
  assert.equal(disabled.site?.googleAds, undefined);
  assert.ok(isSnapshot(disabled));
  raw
    .prepare(
      'UPDATE site_settings SET google_ads_id = ?, google_ads_consultation_label = ?, google_ads_zalo_label = ?',
    )
    .run('AW-123456789', 'Lead_AbC', 'Zalo-1');
  const published = await buildSnapshot(db);
  assert.deepEqual(published.site?.googleAds, {
    id: 'AW-123456789',
    labels: { consultation: 'Lead_AbC', zalo: 'Zalo-1' },
  });
  assert.ok(isSnapshot(JSON.parse(JSON.stringify(published))));
  for (const googleAds of [
    { id: 'AW-123', labels: { unknown: 'x' } },
    { id: '<script>', labels: {} },
    { id: 'AW-123', labels: { phone: 'x/y' } },
    { id: 'AW-123', labels: [] },
    { id: 'AW-123' },
    null,
  ]) {
    assert.equal(isGoogleAdsConfig(googleAds), false);
    assert.equal(isSnapshot({ ...published, site: { ...published.site, googleAds } }), false);
  }
  assert.throws(
    () => raw.prepare("UPDATE site_settings SET google_ads_id = 'AW-123x'").run(),
    /CHECK/,
  );
  assert.throws(
    () => raw.prepare("UPDATE site_settings SET google_ads_phone_label = '<script>'").run(),
    /CHECK/,
  );
});

test('Google Ads: exact contact hosts only, no destinations or PII in event classification', () => {
  for (const [href, expected] of [
    ['tel:+84123456789', 'phone'],
    ['https://zalo.me/123', 'zalo'],
    ['https://wa.me/123?text=hello', 'whatsapp'],
    ['https://api.whatsapp.com/send?phone=123', 'whatsapp'],
    ['https://zalo.me.evil.example/123', undefined],
    ['https://wa.me@evil.example/', undefined],
    ['http://wa.me/123', undefined],
    ['mailto:a@example.com', undefined],
    ['/#consultation', undefined],
    ['javascript:alert(1)', undefined],
  ] as const)
    assert.equal(googleAdsContactAction(href), expected, href);
});

test('Google Ads: measurement URL drops free text, PII, UTMs and fragments; keeps ad attribution', () => {
  assert.equal(
    googleAdsPageLocation(
      'https://clinic.example/services?email=patient%40example.com&service=private&utm_term=medical&gclid=Click_123-abc&gbraid=braid#private',
    ),
    'https://clinic.example/services?gclid=Click_123-abc&gbraid=braid',
  );
  assert.equal(
    googleAdsPageLocation('https://clinic.example/?gclid=bad%40email.com&wbraid=abc_123'),
    'https://clinic.example/?wbraid=abc_123',
  );
});
