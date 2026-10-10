// Checks the internal links of the built site (run `npm run build` first):
//   - every <a href="/path"> points at a page (or file) that was built;
//   - every #anchor exists on the page it points to, including /page#anchor;
//   - no link is an empty "#".
// Links the owner still has to supply content for are listed below; they are reported but do not fail the check.
// Remove an entry as soon as its page exists. Usage: npm run check:links [-- <build dir>]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? 'dist/client';

/** Pages the owner has not provided content for yet (legal texts need the clinic's own wording). */
const PENDING = new Map([
  ['/privacy-policy', 'Privacy Policy text to be provided by the owner'],
  [
    '/cookie-settings',
    'Cookie settings: depends on whether the site will use cookies or analytics',
  ],
  ['/legal-disclaimer', 'Legal Disclaimer text to be provided by the owner'],
]);

if (!existsSync(root)) {
  console.error(`No build found at ${root}. Run "npm run build" first.`);
  process.exit(2);
}

const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.html')) pages.push(path);
  }
})(root);

const urlOf = (file) => {
  const rel = '/' + relative(root, file).replaceAll('\\', '/');
  return rel.replace(/index\.html$/, '').replace(/\.html$/, '') || '/';
};
const html = new Map(
  pages.map((file) => [urlOf(file).replace(/(.)\/$/, '$1'), readFileSync(file, 'utf8')]),
);
const idsOf = (text) => new Set([...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const ids = new Map([...html].map(([url, text]) => [url, idsOf(text)]));
const fileExists = (path) => {
  const full = join(root, path);
  return existsSync(full) && statSync(full).isFile();
};

const problems = new Map();
const pending = new Map();
const note = (map, key, from) => (map.get(key) ?? map.set(key, new Set()).get(key)).add(from);

for (const [from, text] of html) {
  for (const match of text.matchAll(/<a\s[^>]*?href="([^"]*)"/g)) {
    const href = match[1].replaceAll('&amp;', '&');
    if (/^(https?:|mailto:|tel:)/i.test(href)) continue;
    if (href === '' || href === '#') {
      note(problems, 'empty link (#)', from);
      continue;
    }
    const [path, anchor] = href.split('#');
    const target = (path || from).replace(/\?.*$/, '').replace(/(.)\/$/, '$1');
    if (path && !html.has(target) && !fileExists(target)) {
      if (PENDING.has(target)) note(pending, target, from);
      else note(problems, `no page: ${href}`, from);
      continue;
    }
    if (anchor && html.has(target) && !ids.get(target).has(anchor)) {
      note(problems, `no #${anchor} on ${target}`, from);
    }
  }
}

const show = (map) =>
  [...map].map(([what, from]) => {
    const where = [...from].slice(0, 3).join(', ');
    return `  ${what}  (${where}${from.size > 3 ? ` and ${from.size - 3} more` : ''})`;
  });

console.log(`Checked ${html.size} pages.`);
if (pending.size > 0) {
  console.log('Waiting for the owner (not an error):');
  for (const line of show(pending)) console.log(line);
  for (const [target, why] of PENDING)
    if (pending.has(target)) console.log(`    ${target}: ${why}`);
}
if (problems.size > 0) {
  console.error('Broken links:');
  for (const line of show(problems)) console.error(line);
  process.exit(1);
}
console.log('No broken links.');
