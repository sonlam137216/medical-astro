// The inline scripts the layouts write into every page. The text lives here, in one place, because the
// Content-Security-Policy must list its hash: astro.config.mjs hashes exactly this string and BaseLayout.astro
// prints exactly this string, so they cannot drift apart. Plain JavaScript, not type-checked.
import { createHash } from 'node:crypto';

/** Marks the page as scripted before it paints, so CSS can tell "script will run" from "no script". */
export const JS_FLAG_SCRIPT = "document.documentElement.classList.add('js');";

/** Meta Pixel base code, used only by the public SiteLayout. */
export const META_PIXEL_ID = '2062370661047192';
export const META_PIXEL_SCRIPT = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`;

/**
 * `sha256-…`, the form a CSP source list wants.
 * @param {string} text
 * @returns {`sha256-${string}`}
 */
export function cspHash(text) {
  return `sha256-${createHash('sha256').update(text).digest('base64')}`;
}
