// Motion check of the built site (run `npm run build` first). With animations enabled it scrolls every page
// top to bottom and reports:
//   - blocks that stay faded or shifted once they are fully on screen (a reveal that never finishes);
//   - layout shift (CLS) measured during the scroll, which animations must not add to;
//   - that nothing moves when the visitor asks for reduced motion.
// Usage: npm run check:motion [-- --width=390] [-- --only=/about/]
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { chromium } from 'playwright-core';

const root = 'dist/client';
const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const widths = flag('width') ? [Number(flag('width'))] : [1440, 390];
const only = flag('only');
if (!existsSync(root)) {
  console.error('No build found. Run "npm run build" first.');
  process.exit(2);
}
const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.html')) {
      pages.push(
        ('/' + relative(root, path)).replace(/index\.html$/, '').replace(/\.html$/, '') || '/',
      );
    }
  }
})(root);
const targets = pages.filter((p) => !only || p === only).sort();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const server = createServer((req, res) => {
  let file = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  // Pages are built as `about.html` and served at `/about` (build.format 'file'); `/travel-guide` is both a
  // page and a folder of pages, so the page file comes first.
  if (existsSync(file + '.html')) file += '.html';
  else if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || !file.startsWith(root)) return void res.writeHead(404).end();
  res
    .writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    .end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

const SELECTOR = '.intro, .card, .faq details';
let failures = 0;
for (const width of widths) {
  for (const motion of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({
      viewport: { width, height: 800 },
      reducedMotion: motion,
    });
    for (const path of targets) {
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(base + path, { waitUntil: 'load' });
      const animated = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).animationName : 'none';
      }, SELECTOR);
      // Scroll in steps like a reader would, then settle.
      await page.evaluate(async () => {
        const h = document.documentElement.scrollHeight;
        for (let y = 0; y < h; y += 300) {
          window.scrollTo({ top: y, behavior: 'instant' });
          await new Promise((r) => setTimeout(r, 40));
        }
      });
      await page.waitForTimeout(300);
      // A scroll-driven animation catches up with a jump on the next frames: wait for them before reading.
      const stuck = await page.evaluate(async (sel) => {
        const out = [];
        for (const el of document.querySelectorAll(sel)) {
          // Put the block in the middle of the screen, as if the reader had stopped on it.
          el.scrollIntoView({ block: 'center', behavior: 'instant' });
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          if (r.height > innerHeight * 0.9) continue; // taller than the screen can never be fully "in"
          if (Number(s.opacity) < 0.99 || (s.translate !== 'none' && s.translate !== '0px')) {
            out.push(
              `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')} opacity=${s.opacity} translate=${s.translate}`,
            );
          }
        }
        return out;
      }, SELECTOR);
      await page.waitForTimeout(700);
      const stuck2 = await page.evaluate(async (sel) => {
        let count = 0;
        for (const el of document.querySelectorAll(sel)) {
          el.scrollIntoView({ block: 'center', behavior: 'instant' });
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
          if (
            Number(getComputedStyle(el).opacity) < 0.99 &&
            el.getBoundingClientRect().height < innerHeight * 0.9
          )
            count++;
        }
        return count;
      }, SELECTOR);
      const cls = await page.evaluate(() => window.__cls);
      // "reduce" must leave the reveal off entirely.
      const bad = stuck2 > 0 || cls > 0.1 || (motion === 'reduce' && animated !== 'none');
      if (bad) failures++;
      if (bad || stuck.length) {
        console.log(
          `[${width} ${motion}] ${path} cls=${cls.toFixed(3)} stuck=${stuck2}${stuck.length ? ' first: ' + stuck.slice(0, 3).join(' | ') : ''}`,
        );
      }
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
server.close();
console.log(
  `${targets.length} pages × ${widths.length} widths × 2 motion settings: ${failures} problem(s).`,
);
process.exit(failures ? 1 : 0);
