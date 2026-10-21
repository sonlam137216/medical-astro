// Search engine ownership checks typed in Site details: Google Search Console and Bing Webmaster Tools each give a
// <meta> tag for the Home page. Only the token (the tag's `content`) is stored and published; the build writes the
// tags back, on the Home page of indexable builds only (BaseLayout). A DNS TXT record is the preferred way to verify
// (PUBLISHING.md); this is the fallback.

export const VERIFICATION_ENGINES = [
  {
    key: 'google',
    column: 'google_site_verification',
    meta: 'google-site-verification',
    name: 'Google',
  },
  { key: 'bing', column: 'bing_site_verification', meta: 'msvalidate.01', name: 'Bing' },
] as const;

export type VerificationEngine = (typeof VERIFICATION_ENGINES)[number];
export type VerificationKey = VerificationEngine['key'];
/** Tokens by engine; an engine is absent when it has no token. */
export type SiteVerification = Partial<Record<VerificationKey, string>>;

/** The shape both engines use (Google: 43 characters of base64url, Bing: 32 hex digits); the DB CHECK matches it. */
export const VERIFICATION_TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

const META_RE = /^<meta\b([^<>]*?)\/?>$/i;
const ATTR_RE = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

export type TokenResult = { ok: true; value: string | null } | { ok: false; error: string };

/**
 * What was typed in the box of `engine` -> its token. Accepts the token alone, or the whole tag copied from the
 * search engine (then the `content` is kept, and a tag of the other engine is refused). Empty = no token.
 */
export function parseVerificationToken(raw: string, engine: VerificationEngine): TokenResult {
  const typed = raw.trim();
  if (!typed) return { ok: true, value: null };

  let token = typed;
  if (typed.startsWith('<')) {
    const tag = META_RE.exec(typed);
    if (!tag)
      return { ok: false, error: `Paste the <meta …> tag from ${engine.name}, or only its code.` };
    const attrs = new Map<string, string>();
    for (const [, key, double, single, bare] of tag[1].matchAll(ATTR_RE)) {
      attrs.set(key.toLowerCase(), double ?? single ?? bare ?? '');
    }
    const name = attrs.get('name')?.trim().toLowerCase();
    if (name !== engine.meta) {
      const other = VERIFICATION_ENGINES.find((e) => e.meta === name);
      return {
        ok: false,
        error: other
          ? `This is the ${other.name} tag. Paste it in the ${other.name} box.`
          : `This is not the ${engine.name} tag: it should have name="${engine.meta}".`,
      };
    }
    token = (attrs.get('content') ?? '').trim();
  } else if (/^(["']).*\1$/.test(typed)) {
    token = typed.slice(1, -1).trim();
  }

  if (!VERIFICATION_TOKEN_RE.test(token)) {
    return {
      ok: false,
      error: `Paste the code from the content="…" part of the ${engine.name} tag (8 to 128 letters, numbers, - or _), or the whole tag.`,
    };
  }
  return { ok: true, value: token };
}

/**
 * The parsed Site details form: each engine's box is replaced by its token (a pasted tag is reduced to its code).
 * Returns the error of each box that holds something else; `row` is then left as it was.
 */
export function normalizeVerificationFields(row: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  const tokens: Record<string, string | null> = {};
  for (const engine of VERIFICATION_ENGINES) {
    const result = parseVerificationToken(String(row[engine.column] ?? ''), engine);
    if (result.ok) tokens[engine.column] = result.value;
    else errors[engine.column] = result.error;
  }
  if (Object.keys(errors).length === 0) Object.assign(row, tokens);
  return errors;
}

/** Published tokens -> the <meta> tags of the Home page, in a fixed order. */
export function verificationMeta(
  verification: SiteVerification | undefined,
): { name: string; content: string }[] {
  return VERIFICATION_ENGINES.flatMap((e) => {
    const token = verification?.[e.key];
    return token && VERIFICATION_TOKEN_RE.test(token) ? [{ name: e.meta, content: token }] : [];
  });
}

/** A hand-edited or old snapshot: absent, or an object of known engines with valid tokens. */
export function isSiteVerification(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = VERIFICATION_ENGINES.map((e) => e.key as string);
  return Object.entries(value).every(
    ([k, v]) => keys.includes(k) && typeof v === 'string' && VERIFICATION_TOKEN_RE.test(v),
  );
}
