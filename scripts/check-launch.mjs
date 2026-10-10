// Launch gate: lists the sample content (placeholders from the design) still present in the built pages.
// Run `npm run build` first, ideally with the real published content (see PUBLISHING.md), then `npm run check:launch`.
// Exits 1 while anything is found, so it can gate a production launch. It is not part of CI: it fails on purpose
// until the owner has supplied the real figures, prices, photos and texts.
// Each marker is text or a file name that only appears in sample content. When real content replaces a sample,
// the marker stops matching; when a new sample is added to the code, add a marker for it here.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? 'dist/client';

const MARKERS = [
  // [text found in the page, what it is, what is needed]
  ['TOTAL: 600$', 'Sample price on the service and package cards', 'Real prices (admin module A3)'],
  ['TOTAL: $600', 'Sample price on the Dental Implants cards', 'Real prices (admin module A3)'],
  [
    'C$1,250',
    'Sample comparison table cells (every cell is the same)',
    'Real prices per country with source and date (A3)',
  ],
  [
    'Lower cost, same quality of care',
    'Placeholder bullet text on service/package cards',
    'Real inclusions per service and package (A1, A2)',
  ],
  ['Experienced team', 'Six identical "Why choose" cards', 'Real reasons, one per card'],
  ['30,000+', 'Unverified statistic', 'Confirm the figure can be substantiated, or remove it'],
  ['10,000+', 'Unverified statistic', 'Confirm the figure can be substantiated, or remove it'],
  ['5,000+', 'Unverified statistic', 'Confirm the figure can be substantiated, or remove it'],
  [
    '4.9/5 on Google Reviews',
    'Unverified rating claim',
    'Confirm it is current and verifiable, or remove it',
  ],
  ['Trusted by patients from 20+ countries', 'Unverified claim', 'Confirm it, or remove it'],
  ['15+ Years of Experience', 'Unverified claim', 'Confirm it, or remove it'],
  [
    'Answer to be provided by Melatec',
    'FAQ questions without answers',
    'Answers approved by the clinic (admin: FAQs)',
  ],
  [
    'Methodology to be provided by Melatec',
    'Price comparison methodology',
    'The clinic’s explanation of how the figures are worked out',
  ],
  [
    'Hoan Kiem Lake: The Heart of Hanoi',
    'Sample article on Home (not from the CMS)',
    'Publish real Travel Guide articles (admin: Articles)',
  ],
  ['Da Nang city', 'Sample destination cards (identical)', 'Real destinations (admin module A4)'],
  [
    /<div[^>]*class="social__card/,
    'Social cards without a link',
    'Social profile URLs in Site details',
  ],
  [
    'doctor-portrait.',
    'One sample portrait shared by every doctor',
    'Doctor photos with consent (admin: Doctors)',
  ],
  ['hotel-room.', 'Hotel room photo standing in for the clinic rooms', 'Photos of the clinic'],
  ['panoramic-xray.', 'Sample X-ray image', 'Licensed image or a consented case'],
  ['before-after.', 'Photo of a real patient (before/after)', 'Written consent and usage rights'],
];

if (!existsSync(root)) {
  console.error(`No build found at ${root}. Run "npm run build" first.`);
  process.exit(2);
}
const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.html')) pages.push(path);
  }
})(root);

const urlOf = (file) =>
  ('/' + relative(root, file)).replace(/index\.html$/, '').replace(/(.)\/$/, '$1') || '/';
const found = new Map();
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  for (const marker of MARKERS) {
    const [needle] = marker;
    if (typeof needle === 'string' ? html.includes(needle) : needle.test(html)) {
      (found.get(marker) ?? found.set(marker, []).get(marker)).push(urlOf(file));
    }
  }
}

console.log(`Checked ${pages.length} pages for sample content.`);
if (found.size === 0) {
  console.log('No sample content found.');
  process.exit(0);
}
console.log(`${found.size} kinds of sample content still on the site:\n`);
for (const [[needle, what, need], where] of found) {
  const label = typeof needle === 'string' ? `“${needle}”` : 'social cards';
  console.log(`- ${what}  [${label}]`);
  console.log(`    needed: ${need}`);
  console.log(
    `    on: ${where.slice(0, 4).join(', ')}${where.length > 4 ? ` and ${where.length - 4} more` : ''}`,
  );
}
process.exit(1);
