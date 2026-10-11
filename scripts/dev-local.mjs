// Runs the public website on the content you published in the LOCAL admin.
//
//   npm run dev:local              astro dev, reading the newest local revision
//   npm run dev:local -- --port 4400   extra arguments go to `astro dev`
//   npm run build:local            one build from the newest local revision (output in dist/)
//
// Why this exists: public pages read the published revision over Cloudflare's HTTP API while they build, but the
// local D1 is a SQLite file under .wrangler/state that Cloudflare's API cannot see. This script starts a small
// stand-in for that API on 127.0.0.1, answering from the local file (read-only, SELECT only), and points the
// build at it. Nothing leaves your machine and no Cloudflare credentials are used.
//
// Publish in /admin first (that saves a revision); draft edits alone are not shown, same as on the real site.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const mode = process.argv[2] === 'build' ? 'build' : 'dev';
const passThrough = process.argv.slice(3);
const port = Number(process.env.LOCAL_D1_PORT || 8799);

const stateDir = join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

/** The local D1 file (wrangler names it by a hash; metadata.sqlite is miniflare's own bookkeeping). */
function databaseFile() {
  if (!existsSync(stateDir)) return null;
  const files = readdirSync(stateDir)
    .filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
    .map((f) => ({ path: join(stateDir, f), time: statSync(join(stateDir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  return files[0]?.path ?? null;
}

if (!databaseFile()) {
  console.error(
    'No local database yet. Run `npm run db:migrate` (and use the admin once), then try again.',
  );
  process.exit(1);
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    try {
      if (req.method !== 'POST' || !/\/d1\/database\/[^/]+\/query$/.test(req.url ?? '')) {
        return reply(res, 404, { success: false, errors: [{ code: 404 }] });
      }
      const { sql, params = [] } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      // The build only ever reads. Refusing everything else keeps this from changing your data by accident.
      if (typeof sql !== 'string' || !/^\s*select\b/i.test(sql)) {
        return reply(res, 400, { success: false, errors: [{ code: 400 }] });
      }
      const file = databaseFile();
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        const results = db
          .prepare(sql)
          .all(...params)
          .map((row) => ({ ...row }));
        reply(res, 200, { success: true, errors: [], result: [{ success: true, results }] });
      } finally {
        db.close();
      }
    } catch (error) {
      console.error('[local-d1]', error instanceof Error ? error.message : 'error');
      reply(res, 200, { success: false, errors: [{ code: 7500 }], result: [] });
    }
  });
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', resolve);
}).catch((error) => {
  console.error(
    error?.code === 'EADDRINUSE'
      ? `Port ${port} is busy. Another \`dev:local\` may be running, or set LOCAL_D1_PORT.`
      : error,
  );
  process.exit(1);
});

console.log(`[local-d1] reading ${databaseFile()}`);

// Prerendering runs inside workerd, which does not see process.env: settings must come through .dev.vars (the
// publish workflow does the same). A marked block is added now and removed on exit; one left behind by a crash
// is removed at the next start, so it can never linger.
const devVars = join(process.cwd(), '.dev.vars');
const BEGIN = '# >>> dev-local (added by npm run dev:local, removed on exit)';
const END = '# <<< dev-local';

function withoutBlock(text) {
  const start = text.indexOf(BEGIN);
  const stop = text.indexOf(END);
  if (start < 0 || stop < start) return text;
  return (text.slice(0, start) + text.slice(stop + END.length)).replace(/\n{3,}/g, '\n\n');
}

const original = existsSync(devVars) ? withoutBlock(readFileSync(devVars, 'utf8')) : '';
const block = [
  BEGIN,
  'CLOUDFLARE_ACCOUNT_ID=local',
  'CLOUDFLARE_API_TOKEN=local',
  'D1_DATABASE_ID=local',
  `CLOUDFLARE_API_URL=http://127.0.0.1:${port}`,
  END,
  '',
].join('\n');
writeFileSync(devVars, `${original.replace(/\s*$/, '\n')}\n${block}`);

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  writeFileSync(devVars, original);
}
process.on('exit', restore);

const child = spawn('npx', ['astro', mode, ...passThrough], { stdio: 'inherit' });

const stop = (signal) => () => child.kill(signal);
process.on('SIGINT', stop('SIGINT'));
process.on('SIGTERM', stop('SIGTERM'));
child.on('exit', (code) => {
  restore();
  server.close();
  process.exit(code ?? 0);
});
