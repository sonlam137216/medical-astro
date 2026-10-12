// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import redirectsFile from './integrations/redirects-file.mjs';
import sitemapFile from './integrations/sitemap-file.mjs';
import { JS_FLAG_SCRIPT, cspHash } from './integrations/inline-scripts.mjs';
import { buildSetting, isIndexable, siteOrigin } from './integrations/build-env.mjs';

// Public origin of the website (SITE_URL) and whether this build may be indexed (SITE_INDEXABLE=true).
// Both come from the build environment, so staging and production builds differ without code changes.
const site = siteOrigin();
const indexable = isIndexable();

// Content-Security-Policy (a <meta> tag Astro writes into every page, with hashes of the scripts it finds).
// Scripts: only the site's own files and the inline scripts present at build time, so injected script does not run.
// Styles keep 'unsafe-inline' because pictures set `style="aspect-ratio…; object-position…"` attributes, which a
// hash-based style policy would block; a style cannot run code, so this is the smaller risk.
// Picture and video origins: the media CDN (R2_PUBLIC_BASE_URL) when one is configured, else the site itself.
const mediaOrigin = (() => {
  try {
    const base = buildSetting('R2_PUBLIC_BASE_URL');
    return base ? new URL(base).origin : undefined;
  } catch {
    return undefined;
  }
})();
// Cloudflare Turnstile (spam check on the consultation forms) is allowed only when it is switched on.
const turnstile = buildSetting('TURNSTILE_SITE_KEY')
  ? 'https://challenges.cloudflare.com'
  : undefined;
/** @param {(string | undefined)[]} list */
const sources = (...list) => list.filter(Boolean).join(' ');

// https://astro.build/config
export default defineConfig({
  site,
  integrations: [redirectsFile(), sitemapFile({ origin: site, indexable })],
  // No Markdown content on this site; also silences Astro's warning that Shiki's inline styles clash with the CSP.
  markdown: { syntaxHighlight: false },
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        `img-src ${sources("'self'", 'data:', 'blob:', mediaOrigin)}`,
        `media-src ${sources("'self'", 'blob:', mediaOrigin)}`,
        "font-src 'self'",
        `connect-src ${sources("'self'", turnstile)}`,
        `frame-src ${turnstile ?? "'none'"}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: {
        resources: [sources("'self'", turnstile)],
        // Pages rendered on demand (admin) are not scanned at build time: list the layout's inline script.
        hashes: [cspHash(JS_FLAG_SCRIPT)],
      },
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
  // Replaced at build time: read as `SITE_INDEXABLE` in src/lib/seo.ts.
  vite: { define: { __SITE_INDEXABLE__: JSON.stringify(indexable) } },
  // Default output is static; routes opt in to on-demand rendering with `prerender = false`.
  adapter: cloudflare({
    // Local images are optimised at build time. No runtime Cloudflare Images binding
    // (avoids an extra billable resource); media variants are handled in Phase 5.
    imageService: { build: 'compile', runtime: 'passthrough' },
  }),
  // Admin sign-in keeps its own sessions in D1 (src/lib/admin-auth.ts), so Astro sessions (and their KV namespace) are not needed.
  session: false,
});
