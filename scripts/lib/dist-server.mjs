// Shared by the browser checks: a tiny static server for the built site (dist/client) and the list of its pages.
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

export const root = 'dist/client';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/** Pathnames of every built HTML page, e.g. `/about/`. */
export function listPages() {
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
  return pages.sort();
}

/** Starts the server on a free local port; resolves to `{ base, close }`. */
export async function serveDist() {
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
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => server.close(),
  };
}
