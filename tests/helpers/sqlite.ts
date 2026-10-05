import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SqlDatabase, SqlStatement } from '../../src/lib/db.ts';

// An in-memory SQLite database with the real migrations applied, behind the same interface the Worker gets from
// D1 (prepare / bind / all / batch). Foreign keys are on, like on D1. This is what makes the schema and the
// query layer testable without a Cloudflare account.

const MIGRATIONS = join(import.meta.dirname, '..', '..', 'db', 'migrations');

export function migrate(raw: DatabaseSync) {
  for (const file of readdirSync(MIGRATIONS).sort()) {
    raw.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
}

export function adapt(raw: DatabaseSync): SqlDatabase {
  const make = (query: string, params: unknown[] = []): SqlStatement => ({
    bind: (...values) => make(query, values),
    // node:sqlite returns null-prototype rows; D1 returns plain objects.
    all: async () => ({
      results: raw
        .prepare(query)
        .all(...(params as never[]))
        .map((row) => ({ ...row })),
    }),
  });
  return {
    prepare: (query) => make(query),
    // D1 batches are transactions: all statements succeed or none does.
    batch: async (statements) => {
      raw.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.all());
        raw.exec('COMMIT');
        return out;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export function testDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  migrate(raw);
  return { raw, sql: adapt(raw) };
}

/** Run SQL that is expected to fail and return the error message ('' when it did not fail). */
export function failure(raw: DatabaseSync, sql: string, ...params: unknown[]): string {
  try {
    raw.prepare(sql).run(...(params as never[]));
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
