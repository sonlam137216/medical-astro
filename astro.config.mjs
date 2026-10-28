// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import redirectsFile from './integrations/redirects-file.mjs';
import sitemapFile from './integrations/sitemap-file.mjs';
import { JS_FLAG_SCRIPT, META_PIXEL_SCRIPT, cspHash } from './integrations/inline-scripts.mjs';
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
  // Pages are built as `about.html`, not `about/index.html`: Cloudflare then serves them at `/about` (the form every
  // link and every CMS menu entry uses) and redirects `/about/` there, so links never go through a redirect.
  // The public pages have small stylesheets: inline them so the first render does not wait for CSS requests.
  build: { format: 'file', inlineStylesheets: 'always' },
  integrations: [redirectsFile(), sitemapFile({ origin: site, indexable })],
  // Covers of the Home page YouTube/Vimeo videos are downloaded at build time and served from this site
  // (src/lib/video-thumbnail.ts; same list as THUMBNAIL_HOSTS in src/lib/video-embed.ts).
  image: { domains: ['i.ytimg.com', 'i.vimeocdn.com'] },
  // No Markdown content on this site; also silences Astro's warning that Shiki's inline styles clash with the CSP.
  markdown: { syntaxHighlight: false },
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        // Meta Pixel sends tracking images to www.facebook.com and diagnostic images to connect.facebook.net.
        `img-src ${sources("'self'", 'data:', 'blob:', mediaOrigin, 'https://www.facebook.com', 'https://connect.facebook.net')}`,
        `media-src ${sources("'self'", 'blob:', mediaOrigin)}`,
        "font-src 'self'",
        // Cloudflare Web Analytics is enabled on the live zone and injects its beacon at the edge.
        `connect-src ${sources("'self'", turnstile, 'https://cloudflareinsights.com', 'https://www.facebook.com')}`,
        // The Home page video when it is a YouTube or Vimeo link (see src/components/VideoEmbed.astro).
        `frame-src ${sources(turnstile, 'https://www.youtube-nocookie.com', 'https://player.vimeo.com')}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: {
        resources: [
          sources(
            "'self'",
            turnstile,
            'https://static.cloudflareinsights.com',
            'https://connect.facebook.net',
          ),
        ],
        // Scripts supplied through set:html need their hashes listed explicitly.
        hashes: [cspHash(JS_FLAG_SCRIPT), cspHash(META_PIXEL_SCRIPT)],
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
