import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashSnapshot,
  isSnapshot,
  sampleSections,
  snapshotProblems,
  type Snapshot,
} from '../src/lib/snapshot.ts';

const doctor = (over = {}) => ({
  slug: 'a',
  name: 'Dr A',
  role: null,
  bio: null,
  credentials: [],
  languages: ['English'],
  image: null,
  ...over,
});
const site = {
  name: 'Clinic',
  tagline: null,
  phoneDisplay: null,
  phoneIntl: null,
  whatsappUrl: null,
  email: null,
  addressLine: null,
  hours: null,
  copyright: null,
  social: [],
};
const nav = [{ location: 'header', label: 'Home', href: '/' }];
const complete: Snapshot = { site, navigation: nav, doctors: [doctor()] };

test('older revisions (only doctors) are still valid', () => {
  assert.equal(isSnapshot({ doctors: [] }), true);
  assert.equal(
    isSnapshot({ doctors: [{ slug: 'a', name: 'A', credentials: [], languages: [] }] }),
    true,
  );
});

test('a snapshot with every section is valid', () => {
  assert.equal(isSnapshot({ ...complete, pages: [], faqs: [], redirects: [] }), true);
  assert.equal(isSnapshot({}), true);
});

test('malformed snapshots are rejected', () => {
  for (const bad of [
    null,
    'x',
    5,
    [],
    { doctors: 'no' },
    { navigation: {} },
    { site: { name: 5 } },
    { doctors: [{ slug: 1, name: 'x', credentials: [], languages: [] }] },
    { doctors: [{ slug: 'a', name: 'A', credentials: [], languages: [], image: { key: 5 } }] },
  ]) {
    assert.equal(isSnapshot(bad), false, JSON.stringify(bad));
  }
});

test('hash is stable and changes with content', async () => {
  const a = await hashSnapshot(complete);
  assert.equal(a, await hashSnapshot(JSON.parse(JSON.stringify(complete))));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, await hashSnapshot({ ...complete, doctors: [doctor({ name: 'Dr B' })] }));
});

test('images need a description unless decorative', () => {
  const img = {
    key: 'media/x/v1/480.webp',
    width: 480,
    height: 300,
    alt: null,
    decorative: false,
    widths: [480],
  };
  assert.equal(snapshotProblems({ doctors: [doctor({ image: img })] }).length, 1);
  assert.equal(
    snapshotProblems({ doctors: [doctor({ image: { ...img, decorative: true } })] }).length,
    0,
  );
  assert.equal(
    snapshotProblems({ doctors: [doctor({ image: { ...img, alt: 'A dentist' } })] }).length,
    0,
  );
});

test('redirect problems', () => {
  const r = (from: string, to: string) => ({ from, to, status: 301 as const });
  assert.equal(snapshotProblems({ redirects: [r('/a', '/a')] }).length, 1);
  assert.equal(snapshotProblems({ redirects: [r('/a', '#top')] }).length, 1);
  assert.equal(snapshotProblems({ redirects: [r('/a', 'mailto:x@y.co')] }).length, 1);
  assert.equal(
    snapshotProblems({ redirects: [r('/a', '/b'), r('/c', 'https://example.com/x')] }).length,
    0,
  );
});

test('production refuses sample content, staging does not', () => {
  assert.deepEqual(sampleSections(complete), []);
  assert.equal(sampleSections({ doctors: [doctor()] }).length, 2); // site + menu
  assert.equal(snapshotProblems({}, 'staging').length, 0);
  assert.equal(snapshotProblems({}, 'production').length, 3);
  assert.equal(snapshotProblems(complete, 'production').length, 0);
  assert.ok(snapshotProblems({ site }, 'production').some((p) => p.startsWith('Doctors')));
});
