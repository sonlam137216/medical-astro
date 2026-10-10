import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_SECTIONS } from '../src/lib/cms/sections.ts';
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
const location = (over = {}) => ({
  slug: 'ha-noi',
  name: 'Melatec Ha Noi',
  address: '26 Doan Thi Diem Street',
  directionsUrl: null,
  image: null,
  ...over,
});
const complete: Snapshot = {
  site,
  navigation: nav,
  doctors: [doctor()],
  locations: [location()],
  packages: [
    {
      slug: 'p',
      kind: 'single_treatment',
      title: 'P',
      inclusions: [],
      price: null,
      priceConditions: null,
      service: null,
      image: null,
    },
  ],
  destinations: [{ slug: 'd', name: 'D', summary: null, image: null }],
  sections: REQUIRED_SECTIONS.map((key) => ({ key, visible: false, data: {} })),
  services: [
    { slug: 's', title: 'S', summary: null, inclusions: [], priceText: null, image: null },
  ],
};

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
  assert.equal(sampleSections({ doctors: [doctor()] }).length, 6 + REQUIRED_SECTIONS.length); // everything but the doctors
  assert.equal(snapshotProblems({}, 'staging').length, 0);
  assert.equal(snapshotProblems({}, 'production').length, 7 + REQUIRED_SECTIONS.length);
  assert.equal(snapshotProblems(complete, 'production').length, 0);
  assert.ok(snapshotProblems({ site }, 'production').some((p) => p.startsWith('Doctors')));
});

test('locations: validated shape, photo needs a description', () => {
  assert.equal(isSnapshot({ locations: [location()] }), true);
  for (const bad of [
    { locations: {} },
    { locations: [{ slug: 'a' }] },
    { locations: [location({ image: { key: 5 } })] },
  ]) {
    assert.equal(isSnapshot(bad), false, JSON.stringify(bad));
  }
  const img = {
    key: 'media/x/v1/480.webp',
    width: 480,
    height: 300,
    alt: null,
    decorative: false,
    widths: [480],
  };
  assert.equal(snapshotProblems({ locations: [location({ image: img })] }).length, 1);
  assert.equal(
    snapshotProblems({ locations: [location({ image: { ...img, alt: 'Clinic front' } })] }).length,
    0,
  );
});

test('services: validated shape, photo needs a description, required for production', () => {
  const service = (over = {}) => ({
    slug: 'dental-implants',
    title: 'Dental Implants',
    summary: null,
    inclusions: [],
    priceText: null,
    image: null,
    ...over,
  });
  assert.equal(isSnapshot({ services: [service()] }), true);
  for (const bad of [
    { services: {} },
    { services: [service({ inclusions: 'x' })] },
    { services: [service({ image: { key: 5 } })] },
  ]) {
    assert.equal(isSnapshot(bad), false, JSON.stringify(bad));
  }
  const img = {
    key: 'media/x/v1/480.webp',
    width: 480,
    height: 300,
    alt: null,
    decorative: false,
    widths: [480],
  };
  assert.equal(snapshotProblems({ services: [service({ image: img })] }).length, 1);
  assert.ok(
    snapshotProblems({ ...complete, services: undefined }, 'production').some((p) =>
      p.startsWith('Services'),
    ),
  );
});
