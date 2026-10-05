// Creates an admin account, or sets a new password for an existing one (which also signs it out everywhere).
//
//   npm run admin:create -- you@example.com                       local database
//   npm run admin:create -- you@example.com --remote              production database
//   npm run admin:create -- you@example.com --remote --env staging
//
// The password is read from ADMIN_PASSWORD, or asked for without echo. It is never taken from the command line
// (that would end up in shell history). Only a salted PBKDF2 hash is written to the database.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword, passwordProblem } from '../src/lib/password.ts';

const args = process.argv.slice(2);
const envAt = args.indexOf('--env');
const envName = envAt >= 0 ? args[envAt + 1] : undefined;
const remote = args.includes('--remote');
const email = args.find((a, i) => !a.startsWith('--') && (envAt < 0 || i !== envAt + 1));

// A plain whitelist on purpose: the address ends up inside an SQL string, so quotes and separators cannot pass.
if (
  !email ||
  !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email) ||
  email.length > 254
) {
  console.error('Usage: npm run admin:create -- <email> [--remote] [--env staging]');
  process.exit(1);
}

function ask(prompt) {
  if (!process.stdin.isTTY) {
    console.error('Set ADMIN_PASSWORD, or run this in a terminal to be asked for it.');
    process.exit(1);
  }
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let text = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(text);
          return;
        }
        if (c === '\u0003') process.exit(130); // Ctrl-C
        text = c === '\u007f' ? text.slice(0, -1) : text + c;
      }
    };
    process.stdin.on('data', onData);
  });
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  password = await ask('New password (min 12 characters): ');
  if ((await ask('Repeat the password: ')) !== password) {
    console.error('The passwords do not match.');
    process.exit(1);
  }
}
const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const hash = await hashPassword(password);
const sql =
  `INSERT INTO admins (email, password_hash) VALUES ('${email}', '${hash}')\n` +
  `  ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash;\n` +
  `DELETE FROM admin_sessions WHERE admin_id = (SELECT id FROM admins WHERE email = '${email}');\n`;

const dir = mkdtempSync(join(tmpdir(), 'melatec-admin-'));
const file = join(dir, 'admin.sql');
try {
  writeFileSync(file, sql, { mode: 0o600 });
  const wrangler = [
    'wrangler',
    'd1',
    'execute',
    'DB',
    '--file',
    file,
    remote ? '--remote' : '--local',
  ];
  if (envName) wrangler.push('--env', envName);
  execFileSync('npx', wrangler, { stdio: 'inherit' });
  console.log(
    `Admin account ready: ${email} (${remote ? 'remote' : 'local'}${envName ? `, ${envName}` : ''})`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
