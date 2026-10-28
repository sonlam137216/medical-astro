// Catch font swaps that wrap the mobile top bar or move the first screen on a cold visit.
// Run after build: npm run check:font-layout. Uses system Chrome, like the other browser checks.
import { chromium } from 'playwright-core';
import { listPages, serveDist } from './lib/dist-server.mjs';

if (!listPages().includes('/')) throw new Error('Build the website before checking font layout.');

const { base, close } = await serveDist();
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const widths = [360, 390, 412, 768, 1440];
let failures = 0;
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 823 } });
    await context.route('**/*.woff2', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    const page = await context.newPage();
    const fontErrors = [];
    page.on('requestfailed', (request) => {
      if (request.resourceType() === 'font') fontErrors.push(request.url());
    });
    await page.addInitScript(() => {
      window.__fontShifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__fontShifts.push(entry.value);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(base, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const cls = await page.evaluate(() =>
      window.__fontShifts.reduce((sum, value) => sum + value, 0),
    );
    const passed = cls <= 0.1 && fontErrors.length === 0;
    if (!passed) failures++;
    console.log(`${passed ? 'PASS' : 'FAIL'} / @${width}: delayed-font CLS ${cls.toFixed(3)}`);
    for (const url of fontErrors) console.log(`  Font failed: ${url}`);
    await context.close();
  }
} finally {
  await browser.close();
  close();
}
process.exitCode = failures > 0 ? 1 : 0;
