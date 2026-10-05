// Astro integration: src/pages/redirects.txt.ts renders the redirect list as /redirects.txt; Cloudflare reads
// static redirects from a file named `_redirects` (Astro does not route files starting with an underscore).
// Plain JavaScript, not type-checked: it only uses Node's file API at build time.
import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export default function redirectsFile() {
  return {
    name: 'melatec-redirects-file',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const from = fileURLToPath(new URL('redirects.txt', dir));
        const to = fileURLToPath(new URL('_redirects', dir));
        if (existsSync(from)) {
          await rm(to, { force: true });
          await rename(from, to);
        }
      },
    },
  };
}
