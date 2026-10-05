// Password hashing with the Web Crypto API (available in Workers and Node), so no dependency is needed.
//
// Format: 'pbkdf2-sha256$<iterations>$<salt base64>$<hash base64>'. The iteration count is stored with the hash,
// so it can be raised later and old hashes still verify.
//
// 100,000 is the cost Workers has long been documented to support for PBKDF2 (the local runtime accepts more, the
// deployed one may not), and it is below what OWASP recommends for PBKDF2-SHA256 (600,000). It is acceptable here
// because sign-in is rate limited per IP, passwords must be long (MIN_PASSWORD_LENGTH) and there is a single small
// group of admins. Raise ITERATIONS only after testing sign-in on staging (CPU time per request matters on the Free
// plan): existing hashes keep working because the count is stored with each hash.

export const ITERATIONS = 100_000;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

const SALT_BYTES = 16;
const HASH_BITS = 256;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// A well-formed hash that never matches anything. Verified when the account does not exist, so that unknown
// emails take as long as wrong passwords.
export const DUMMY_HASH = `pbkdf2-sha256$${ITERATIONS}$${toBase64(new Uint8Array(SALT_BYTES))}$${toBase64(new Uint8Array(HASH_BITS / 8))}`;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** Constant-time comparison of two byte arrays of the same length. */
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split('$');
  const rounds = Number(iterations);
  if (
    scheme !== 'pbkdf2-sha256' ||
    !Number.isInteger(rounds) ||
    rounds < 1 ||
    rounds > 10_000_000
  ) {
    return false;
  }
  try {
    const actual = await derive(password, fromBase64(salt), rounds);
    return equal(actual, fromBase64(hash));
  } catch {
    return false;
  }
}

/** Rules for a new password (checked when an account is created, not when signing in). */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `The password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
