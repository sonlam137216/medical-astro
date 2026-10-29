// Runs actual tracking/form modules and consent markup with fake tag/API responses.
// All requests are intercepted. No consultations or Google Ads conversions leave this browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const origin = 'https://clinic.example';
const receipt = '12345678-1234-4234-8234-123456789abc';
const settings = {
  id: 'AW-123456789',
  labels: { consultation: 'Lead', phone: 'Phone', zalo: 'Zalo', whatsapp: 'WhatsApp' },
};
const component = readFileSync('src/components/GoogleAds.astro', 'utf8');
const builtPage = readFileSync('dist/client/index.html', 'utf8');
const csp = builtPage.match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]+>/i)?.[0];
assert.ok(csp, 'Build the website first: the browser check uses the real built CSP.');
const markup = component.slice(
  component.indexOf('<div data-google-ads'),
  component.indexOf('\n)}'),
);
const css = component.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
const bundle = await build({
  stdin: {
    contents:
      "import { initGoogleAds } from './src/scripts/google-ads.ts'; import './src/scripts/consultation-form.ts'; initGoogleAds();",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
const js = bundle.outputFiles[0].text;
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const html = (
  config = settings,
  expectedOrigin = origin,
) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${csp}<style>${css}</style></head><body>
${markup.replace('data-config={JSON.stringify(config)}', `data-config="${escape(JSON.stringify(config))}"`).replace('data-origin={Astro.site?.origin}', `data-origin="${expectedOrigin}"`)}
<form data-form="consultation" method="post" action="/api/consultation"><input name="submission_id" type="hidden"><input name="name" value="Test patient"><input name="email" value="private@example.com"><button type="submit">Send</button><p data-status></p></form>
<a id="phone" href="tel:+84123456789" target="_blank"><span>Phone</span></a>
<a id="zalo" href="https://zalo.me/123" target="_blank">Zalo</a>
<a id="whatsapp" href="https://wa.me/123" target="_blank">WhatsApp</a>
<a id="same-tab" href="https://wa.me/456">Same tab</a>
<a id="spoof" href="https://zalo.me.evil.example/123" target="_blank">Other</a>
<script type="module" src="/tracking.js"></script></body></html>`;

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
let cases = 0;
async function scenario(
  run,
  {
    config = settings,
    expectedOrigin = origin,
    blocked = false,
    storageBlocked = false,
    width = 1440,
  } = {},
) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const tags = [];
  const errors = [];
  const outgoing = [];
  let response = { status: 200, body: { ok: true, message: 'Saved.', conversionId: receipt } };
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'www.googletagmanager.com') {
      tags.push(url.href);
      if (blocked) return route.abort();
      return route.fulfill({
        contentType: 'text/javascript',
        body: '/* Google tag mocked: queue only. */',
      });
    }
    if (url.origin !== origin) {
      outgoing.push(url.href);
      return route.fulfill({ contentType: 'text/html', body: '<p>Contact destination</p>' });
    }
    if (url.pathname === '/tracking.js')
      return route.fulfill({ contentType: 'text/javascript', body: js });
    if (url.pathname === '/api/consultation')
      return route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      });
    return route.fulfill({ contentType: 'text/html', body: html(config, expectedOrigin) });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  context.on('page', (popup) => {
    if (popup !== page)
      void popup
        .waitForLoadState()
        .then(() => popup.close())
        .catch(() => {});
  });
  await page.addInitScript(
    ({ storageBlocked }) => {
      window.violations = [];
      document.addEventListener('securitypolicyviolation', (event) =>
        window.violations.push(`${event.violatedDirective}: ${event.blockedURI}`),
      );
      if (storageBlocked) {
        Storage.prototype.getItem = () => {
          throw new Error('Storage blocked');
        };
        Storage.prototype.setItem = () => {
          throw new Error('Storage blocked');
        };
      }
    },
    { storageBlocked },
  );
  let visit = 0;
  const load = () =>
    page.goto(`${origin}/?email=private%40example.com&gclid=Click_123&visit=${++visit}#private`);
  await load();
  await page.waitForFunction(() => document.querySelector('[data-form] input[type=hidden]').value);
  const conversions = () =>
    page.evaluate(() =>
      (window.dataLayer ?? [])
        .filter((entry) => entry[0] === 'event' && entry[1] === 'conversion')
        .map((entry) => entry[2]),
    );
  const submit = async () => {
    await page.locator('button[type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('button[type=submit]').disabled);
  };
  try {
    await run({
      page,
      tags,
      load,
      conversions,
      submit,
      outgoing,
      reply: (next) => {
        response = next;
      },
    });
    assert.deepEqual(errors, [], 'no script errors');
    assert.deepEqual(await page.evaluate(() => window.violations), [], 'no CSP violations');
    cases++;
  } finally {
    await context.close();
  }
}

try {
  await scenario(async ({ page, tags, conversions, submit, load }) => {
    assert.equal(tags.length, 0);
    await submit();
    assert.equal((await conversions()).length, 0, 'no pre-consent conversions');
    await page.locator('[data-ads-decline]').click();
    await load();
    assert.equal(tags.length, 0, 'decline persists');
    assert.ok(await page.locator('[data-ads-consent]').isHidden());
    await page.locator('[data-ads-settings]').click();
    await page.locator('[data-ads-accept]').click();
    await page.waitForFunction(() => !!window.dataLayer);
    await page.waitForTimeout(100);
    assert.equal(tags.length, 1);
    assert.equal((await conversions()).length, 0, 'pre-consent leads are not replayed');
    const commands = await page.evaluate(() => window.dataLayer.map((entry) => Array.from(entry)));
    assert.equal(commands[0][0], 'consent');
    assert.equal(commands[0][2].ad_storage, 'denied');
    assert.equal(commands[1][2].ad_user_data, 'granted');
    const info = commands.find((entry) => entry[0] === 'set' && typeof entry[1] === 'object')[1];
    assert.equal(info.page_location, `${origin}/?gclid=Click_123`);
    assert.ok(!JSON.stringify(commands).includes('private@example.com'));
    await load();
    await page.waitForTimeout(100);
    assert.equal(tags.length, 2, 'acceptance persists to next page');
    await page.locator('[data-ads-settings]').click();
    await page.locator('[data-ads-decline]').click();
    await page.waitForTimeout(150);
    assert.equal(tags.length, 2, 'revocation unloads the tag');
  });

  await scenario(async ({ page, conversions, submit, reply }) => {
    await page.locator('[data-ads-accept]').click();
    reply({ status: 422, body: { ok: false, errors: { email: 'Invalid email' } } });
    await submit();
    assert.equal((await conversions()).length, 0);
    reply({ status: 503, body: { ok: false, message: 'Unavailable' } });
    await submit();
    assert.equal((await conversions()).length, 0);
    reply({ status: 200, body: { ok: true, message: 'Saved.' } });
    await submit();
    assert.equal((await conversions()).length, 0, 'honeypot has no receipt');
    reply({ status: 200, body: { ok: true, message: 'Saved.', conversionId: receipt } });
    await submit();
    assert.equal((await conversions()).length, 1);
    assert.deepEqual(await conversions(), [
      { send_to: 'AW-123456789/Lead', transaction_id: receipt, transport_type: 'beacon' },
    ]);
    await submit();
    assert.equal((await conversions()).length, 1, 'same receipt never counts twice in this page');
    for (const id of ['phone', 'zalo', 'whatsapp', 'spoof']) await page.locator(`#${id}`).click();
    const events = await conversions();
    assert.deepEqual(
      events.slice(1).map((event) => event.send_to),
      ['AW-123456789/Phone', 'AW-123456789/Zalo', 'AW-123456789/WhatsApp'],
    );
    assert.ok(!JSON.stringify(events).includes('private'));
  });

  await scenario(
    async ({ page, conversions, submit }) => {
      await page.locator('[data-ads-accept]').click();
      await submit();
      assert.equal((await conversions()).length, 0, 'an empty label does not fire');
      assert.equal(await page.locator('[data-status]').textContent(), 'Saved.');
    },
    { config: { id: settings.id, labels: {} } },
  );

  await scenario(
    async ({ page, submit, outgoing }) => {
      await page.locator('[data-ads-accept]').click();
      await submit();
      assert.equal(await page.locator('[data-status]').textContent(), 'Saved.');
      const start = Date.now();
      await page.locator('#same-tab').click();
      await page.waitForURL('https://wa.me/456');
      assert.ok(Date.now() - start < 2500, 'blocked tag does not trap contact navigation');
      assert.ok(outgoing.includes('https://wa.me/456'));
    },
    { blocked: true },
  );

  await scenario(
    async ({ page, tags, submit }) => {
      await submit();
      assert.equal(tags.length, 0, 'origin mismatch never initializes tracking');
      assert.equal(await page.locator('[data-status]').textContent(), 'Saved.');
    },
    { expectedOrigin: 'https://live.example' },
  );

  await scenario(
    async ({ page, tags }) => {
      await page.locator('[data-ads-accept]').click();
      await page.waitForTimeout(100);
      assert.equal(tags.length, 1, 'storage denial does not break measurement after consent');
    },
    { storageBlocked: true },
  );

  await scenario(
    async ({ page }) => {
      assert.ok(await page.locator('[data-ads-consent]').isVisible());
      const box = await page.locator('[data-ads-accept]').boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= 900);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await page.screenshot({ path: '/tmp/melatec-google-ads-mobile.png', fullPage: true });
    },
    { width: 390 },
  );
  console.log(
    `Google Ads browser check: ${cases} scenarios passed; external tracking and API mocked.`,
  );
} finally {
  await browser.close();
}
