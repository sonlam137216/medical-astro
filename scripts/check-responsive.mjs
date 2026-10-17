// Responsive check of the built site (run `npm run build` first):
//   - no horizontal page scroll at 1440 / 1024 / 768 / 390 / 360 px;
//   - lists the elements that stick out past the right edge (with their selector);
//   - on narrow screens, lists tap targets smaller than 40 px and text smaller than 12 px;
//   - form fields below 16 px (iOS zooms the page when one is focused).
// Uses the system Chrome (playwright-core downloads no browser). Set CHROME_PATH if it is elsewhere.
// Usage: npm run check:responsive [-- --shots] [-- --only=/about] [-- --width=390]
//   --shots   also saves screenshots, cut into slices, to .responsive-shots/<width>/ (git-ignored)
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { chromium } from 'playwright-core';

const root = 'dist/client';
const WIDTHS = [1440, 1024, 768, 390, 360];
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const shots = args.includes('--shots');
const only = flag('only');
const widths = flag('width') ? [Number(flag('width'))] : WIDTHS;

if (!existsSync(root)) {
  console.error(`No build found at ${root}. Run "npm run build" first.`);
  process.exit(2);
}

const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name === 'index.html' || name.endsWith('.html')) {
      const rel = '/' + relative(root, path).replaceAll('\\', '/');
      pages.push(rel.replace(/index\.html$/, '').replace(/\.html$/, '') || '/');
    }
  }
})(root);
const targets = pages.filter((p) => !only || p === only).sort();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(root, path);
  // Pages are built as `about.html` and served at `/about` (build.format 'file'); `/travel-guide` is both a
  // page and a folder of pages, so the page file comes first.
  if (existsSync(file + '.html')) file += '.html';
  else if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || !file.startsWith(root)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const executablePath =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath });

/** Runs inside the page. Returns what sticks out and what is too small. */
const probe = (narrow) => {
  const vw = document.documentElement.clientWidth;
  const sel = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 3; n = n.parentElement) {
      const cls = [...n.classList].slice(0, 2).join('.');
      parts.unshift(n.tagName.toLowerCase() + (cls ? '.' + cls : ''));
    }
    return parts.join(' > ');
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const out = {
    scrollW: document.documentElement.scrollWidth,
    vw,
    overflow: [],
    tap: [],
    text: [],
    fields: [],
  };
  const seen = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    // Anything inside a scroller or a clipping box cannot widen the page.
    let clipped = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflowX !== 'visible') clipped = true;
    }
    if (r.right > vw + 1 && !clipped) {
      // Report the outermost offender only.
      let p = el.parentElement;
      let covered = false;
      while (p && p !== document.body) {
        if (seen.has(p)) covered = true;
        p = p.parentElement;
      }
      if (!covered) {
        seen.add(el);
        out.overflow.push(`${sel(el)} right=${Math.round(r.right)}`);
      }
    }
  }
  if (narrow) {
    for (const el of document.querySelectorAll('a[href], button, summary, [role="button"]')) {
      if (!visible(el) || el.closest('.visually-hidden')) continue;
      // A link or button stretched over its card by an absolute ::after is tapped anywhere on the card.
      const after = getComputedStyle(el, '::after');
      const stretched =
        after.content !== 'none' && after.position === 'absolute' && el.offsetParent;
      const r = (stretched ? el.offsetParent : el).getBoundingClientRect();
      // Inline links inside a paragraph are exempt (WCAG 2.5.8 inline exception).
      if (getComputedStyle(el).display === 'inline') continue;
      if (r.height < 40 || r.width < 40) {
        out.tap.push(
          `${sel(el)} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || '').trim().slice(0, 24)}"`,
        );
      }
    }
    for (const el of document.querySelectorAll(
      'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea',
    )) {
      if (!visible(el) || el.closest('.form__trap')) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 16) out.fields.push(sel(el));
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const small = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || !visible(el) || el.closest('.visually-hidden')) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 12) small.add(sel(el));
    }
    out.text = [...small];
  }
  return out;
};

let problems = 0;
const report = [];
for (const width of widths) {
  const narrow = width <= 768;
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: narrow,
    reducedMotion: 'reduce',
  });
  for (const path of targets) {
    const page = await ctx.newPage();
    await page.goto(base + path, { waitUntil: 'load' });
    // Lazy images and below-the-fold layout settle after a scroll to the bottom.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });
    const r = await page.evaluate(probe, narrow);
    const bad = r.scrollW > r.vw;
    const issues = r.overflow.length + r.tap.length + r.text.length + r.fields.length;
    if (bad) problems++;
    if (issues > 0 || bad) report.push({ width, path, bad, r });
    if (shots) {
      // Slices of ~1.6 viewport heights are readable; one tall full-page image is not.
      const dir = `.responsive-shots/${width}`;
      mkdirSync(dir, { recursive: true });
      const name = path === '/' ? 'home' : path.slice(1, -1).replaceAll('/', '_');
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      const step = Math.round(width <= 768 ? 1400 : 1000);
      for (let y = 0, i = 1; y < height; y += step, i++) {
        await page.screenshot({
          path: `${dir}/${name}-${String(i).padStart(2, '0')}.png`,
          fullPage: true,
          clip: { x: 0, y, width, height: Math.min(step, height - y) },
        });
      }
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
server.close();

for (const { width, path, bad, r } of report) {
  console.log(
    `\n[${width}] ${path}${bad ? '  ✗ HORIZONTAL OVERFLOW' : ''}${r.scrollW > r.vw ? ` (scrollWidth ${r.scrollW} > ${r.vw})` : ''}`,
  );
  for (const o of r.overflow.slice(0, 6)) console.log(`   overflow  ${o}`);
  for (const o of r.tap.slice(0, 8)) console.log(`   tap<40    ${o}`);
  if (r.tap.length > 8) console.log(`   tap<40    … +${r.tap.length - 8} more`);
  for (const o of r.fields) console.log(`   field<16  ${o}`);
  for (const o of r.text.slice(0, 5)) console.log(`   text<12   ${o}`);
}
console.log(
  `\n${targets.length} pages × ${widths.length} widths: ${problems} with horizontal overflow, ${report.length} with any finding.`,
);
process.exit(problems ? 1 : 0);
