// The inline scripts the layouts write into every page. The text lives here, in one place, because the
// Content-Security-Policy must list its hash: astro.config.mjs hashes exactly this string and BaseLayout.astro
// prints exactly this string, so they cannot drift apart. Plain JavaScript, not type-checked.
import { createHash } from 'node:crypto';

/** Marks the page as scripted before it paints, so CSS can tell "script will run" from "no script". */
export const JS_FLAG_SCRIPT = "document.documentElement.classList.add('js');";

/**
 * `sha256-…`, the form a CSP source list wants.
 * @param {string} text
 * @returns {`sha256-${string}`}
 */
export function cspHash(text) {
  return `sha256-${createHash('sha256').update(text).digest('base64')}`;
}
