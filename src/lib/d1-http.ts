// Reads and writes the D1 database over Cloudflare's HTTP API. For code that runs outside a Worker: the
// build (which reads the published revision) and the publish workflow (which records job progress).
// The Worker itself uses the `DB` binding instead. No imports, so Node scripts can load this file too.

export interface D1HttpConfig {
  accountId: string;
  databaseId: string;
  /** API token with D1 access. Backend / CI secret only. */
  apiToken: string;
  /** Override for tests (a local mock); defaults to the real API. */
  baseUrl?: string;
}

type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/**
 * Run one SQL statement and return its rows. Throws with the HTTP status or Cloudflare error code only:
 * response text can echo the statement or row data, so it is never copied into errors.
 */
export async function d1Query<T = Record<string, unknown>>(
  config: D1HttpConfig,
  sql: string,
  params: unknown[] = [],
  fetchImpl: Fetch = fetch as unknown as Fetch,
): Promise<T[]> {
  const base = (config.baseUrl || 'https://api.cloudflare.com/client/v4').replace(/\/+$/, '');
  const url = `${base}/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.apiToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  if (!response.ok) throw new Error(`D1 request failed (HTTP ${response.status})`);

  const body = (await response.json()) as {
    success?: boolean;
    errors?: { code?: number }[];
    result?: { success?: boolean; results?: T[] }[];
  };
  if (!body.success || !body.result?.[0]?.success) {
    throw new Error(`D1 query failed (code ${body.errors?.[0]?.code ?? 'unknown'})`);
  }
  return body.result[0].results ?? [];
}
