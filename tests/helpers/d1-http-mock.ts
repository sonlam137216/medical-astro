import type { DatabaseSync } from 'node:sqlite';

// A fetch that behaves like Cloudflare's D1 HTTP API (POST .../d1/database/<id>/query), answering from a
// SQLite database. Records the calls so tests can check what was sent.
export function d1HttpMock(
  raw: DatabaseSync,
  options: { status?: number; success?: boolean } = {},
) {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fetchImpl = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => {
    calls.push({ url, headers: init.headers, body: init.body });
    if (options.status && options.status !== 200) {
      return {
        ok: false,
        status: options.status,
        json: async () => ({ leak: 'secret-token-123' }),
      };
    }
    const { sql, params } = JSON.parse(init.body) as { sql: string; params: never[] };
    try {
      const results = raw
        .prepare(sql)
        .all(...params)
        .map((r) => ({ ...r }));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: options.success ?? true,
          errors: [],
          result: [{ success: options.success ?? true, results }],
        }),
      };
    } catch {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: false,
          errors: [{ code: 7500, message: 'secret-token-123' }],
          result: [],
        }),
      };
    }
  };
  return { fetchImpl, calls };
}
