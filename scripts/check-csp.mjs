// Content-Security-Policy check of the built site (run `npm run build` first). Opens every page in Chrome and
// reports anything the page's own policy blocks (scripts, styles, pictures, fonts, forms), plus inline event
// attributes (onclick=…), which a script policy blocks too. A page that works only because nobody opened it yet
// is how a policy breaks in production, so this opens each one and uses its menu and accordions.
// Usage: npm run check:csp [-- --width=390] [-- --only=/about/]
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { listPages, root, serveDist } from './lib/dist-server.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const widths = flag('width') ? [Number(flag('width'))] : [1440, 390];
const only = flag('only');
if (!existsSync(root)) {
  console.error('No build found. Run "npm run build" first.');
  process.exit(2);
}
const targets = listPages().filter((p) => !only || p === only);
const { base, close } = await serveDist();
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

let failures = 0;
let withPolicy = 0;
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  for (const path of targets) {
    const page = await ctx.newPage();
    const problems = [];
    await page.addInitScript(() => {
      window.__violations = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        window.__violations.push(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`),
      );
    });
    page.on('pageerror', (e) => problems.push(`script error: ${e.message}`));
    page.on('console', (m) => {
      if (/content security policy/i.test(m.text())) problems.push(m.text().slice(0, 200));
    });
    await page.goto(base + path, { waitUntil: 'load' });
    if (
      await page.evaluate(
        () => !!document.querySelector('meta[http-equiv="content-security-policy"]'),
      )
    )
      withPolicy++;
    else problems.push('no Content-Security-Policy meta tag');
    // Use what the page's scripts do: the mobile menu, the accordions, the first form field.
    await page
      .locator('.hamburger, [aria-controls="site-menu"]')
      .first()
      .click({ timeout: 500 })
      .catch(() => {});
    for (const summary of await page.locator('details > summary').all()) {
      await summary.click({ timeout: 500 }).catch(() => {});
    }
    await page
      .locator('form input:not([type=hidden])')
      .first()
      .focus({ timeout: 500 })
      .catch(() => {});
    await page.waitForTimeout(250);
    const inlineHandlers = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .flatMap((el) => el.getAttributeNames().filter((n) => /^on[a-z]+$/.test(n)))
        .map((n) => `inline event attribute ${n}`),
    );
    problems.push(...inlineHandlers, ...(await page.evaluate(() => window.__violations)));
    if (problems.length > 0) {
      failures++;
      console.log(`FAIL ${path} @${width}`);
      for (const p of new Set(problems)) console.log(`  ${p}`);
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
close();
console.log(
  failures === 0
    ? `CSP check: ${targets.length} pages × ${widths.length} widths, no violations (${withPolicy} page loads had a policy).`
    : `CSP check: ${failures} page loads with problems.`,
);
process.exit(failures === 0 ? 0 : 1);
