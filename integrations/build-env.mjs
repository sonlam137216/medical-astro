// Build settings read by astro.config.mjs (Node, before the build starts). Same sources as `setting()` in
// src/lib/content.ts: the process environment (CI), then the .dev.vars file (local builds, and the file the
// publish workflow writes). Plain JavaScript, not type-checked.
import { existsSync, readFileSync } from 'node:fs';

function devVars() {
  if (!existsSync('.dev.vars')) return {};
  const vars = {};
  for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) vars[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return vars;
}

/** The value of a build setting, or undefined when it is missing or empty. */
export function buildSetting(name) {
  return process.env[name] || devVars()[name] || undefined;
}

/**
 * The public origin of the website (SITE_URL), without a path or trailing slash; undefined when it is not set
 * or is not an http(s) address. Without it the pages carry no canonical/share URLs and no sitemap is written.
 */
export function siteOrigin() {
  const raw = buildSetting('SITE_URL');
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether search engines may index this build: SITE_INDEXABLE=true AND a valid SITE_URL. Everything else
 * (local, staging, a production build that has no domain yet) stays `noindex`.
 */
export function isIndexable() {
  return buildSetting('SITE_INDEXABLE') === 'true' && siteOrigin() !== undefined;
}
