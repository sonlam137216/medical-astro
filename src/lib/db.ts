/* eslint-disable @typescript-eslint/no-explicit-any -- rows are typed per table, embedded relations are not */
import { TABLES, type InsertRow, type Row, type TableName } from './db-schema.ts';

// A small query layer over Cloudflare D1 (SQLite). Server-side only.
//
// What it is for: the admin pages and the form endpoint read and write many tables with the same few
// operations (filter, order, page, insert, update, delete). This layer expresses them once and takes care of
// the things SQLite does differently from what the rest of the code expects:
//  - booleans are stored 0/1, arrays and objects as JSON text: converted both ways using TABLES (db-schema.ts);
//  - constraint failures are reported with the familiar codes ('23505' unique, '23503' foreign key,
//    '23514' check) so callers can show friendly messages without parsing SQLite text;
//  - changes made through an `audit` handle are recorded in audit_logs in the same batch (atomic).
// Everything is parameterised. Table and column names come from code, are checked against a strict pattern,
// and tables must be registered in TABLES, so request data can never reach the SQL text.

export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  all(): Promise<{ results?: unknown[] }>;
}
/** The part of D1Database this layer uses (so tests can run it on node:sqlite). */
export interface SqlDatabase {
  prepare(query: string): SqlStatement;
  batch(statements: SqlStatement[]): Promise<{ results?: unknown[] }[]>;
}

export interface DbError {
  code: string;
  message: string;
}
export type DbResult<T> =
  { data: T; error: null; count: number | null } | { data: null; error: DbError; count: null };

export interface DbContext {
  /** Admin id written to the audit log, or null for changes made without an admin (the consultation form). */
  actorId: string | null;
  /** Write audit_logs rows for changes made through this handle. */
  audit: boolean;
}

/** A row as selected: the table's columns plus any embedded relations (which are not typed). */
export type Out<T extends TableName> = Row<T> & { [embedded: string]: any };

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;
const MAX_PARAMS = 100; // D1 allows at most 100 bound parameters per statement.

function ident(name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`invalid identifier: ${name}`);
  return `"${name}"`;
}

function info(table: string) {
  if (!Object.hasOwn(TABLES, table)) throw new Error(`unknown table: ${table}`);
  return TABLES[table as TableName];
}

/** Map SQLite constraint messages to the Postgres-style codes the callers already handle. */
export function toDbError(error: unknown): DbError {
  const message = error instanceof Error ? error.message : String(error);
  let code = 'D1';
  if (/UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(message)) code = '23505';
  else if (/FOREIGN KEY constraint failed/i.test(message)) code = '23503';
  else if (/CHECK constraint failed/i.test(message)) code = '23514';
  else if (/NOT NULL constraint failed/i.test(message)) code = '23502';
  else if (/immutable/i.test(message)) code = 'P0001';
  return { code, message };
}

function toDb(table: string, column: string, value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value !== null && info(table).json?.includes(column)) return JSON.stringify(value);
  return value;
}

function fromDb(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const t = info(table);
  for (const c of t.bool ?? []) if (c in row && row[c] !== null) row[c] = row[c] === 1;
  for (const c of t.json ?? []) {
    if (typeof row[c] === 'string') row[c] = JSON.parse(row[c] as string);
  }
  return row;
}

function splitTop(source: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') depth--;
    else if (source[i] === ',' && depth === 0) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(source.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

interface Embed {
  key: string;
  table: string;
  fk: string;
  columns: string[];
  n: number;
}

function parseSelect(table: string, source: string) {
  const columns: string[] = [];
  const embeds: Embed[] = [];
  for (const part of splitTop(source)) {
    const embed = /^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)\((.*)\)$/.exec(part);
    if (!embed) {
      if (part !== '*') ident(part);
      columns.push(part);
      continue;
    }
    const [, alias, target, inner] = embed;
    const fk = Object.entries(info(table).refs ?? {}).find(([, t]) => t === target)?.[0];
    if (!fk) throw new Error(`no relation from ${table} to ${target}`);
    const inside = splitTop(inner);
    if (inside.length === 0 || inside.includes('*')) throw new Error('list the embedded columns');
    inside.forEach(ident);
    embeds.push({ key: alias ?? target, table: target, fk, columns: inside, n: embeds.length });
  }
  return { columns, embeds };
}

type Filter = { sql: string; params: unknown[] };

class Query<T extends TableName> implements PromiseLike<DbResult<Out<T>[]>> {
  #op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  #columns = '*';
  #count = false;
  #head = false;
  #returning: string | null = null;
  #filters: Filter[] = [];
  #orders: string[] = [];
  #limit: number | null = null;
  #offset: number | null = null;
  #payload: Record<string, unknown>[] = [];
  #onConflict: string | null = null;
  #ignoreDuplicates = false;
  #shape: 'many' | 'maybe' | 'single' = 'many';

  readonly db: SqlDatabase;
  readonly ctx: DbContext;
  readonly table: T;

  constructor(db: SqlDatabase, ctx: DbContext, table: T) {
    ident(table);
    info(table);
    this.db = db;
    this.ctx = ctx;
    this.table = table;
  }

  select(columns = '*', options: { count?: 'exact'; head?: boolean } = {}) {
    if (this.#op === 'select') this.#columns = columns;
    else this.#returning = columns;
    this.#count = options.count === 'exact';
    this.#head = options.head === true;
    return this;
  }

  insert(rows: InsertRow<T> | InsertRow<T>[]) {
    this.#op = 'insert';
    this.#payload = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
    return this;
  }

  update(values: Partial<InsertRow<T>>) {
    this.#op = 'update';
    this.#payload = [values as Record<string, unknown>];
    return this;
  }

  upsert(
    rows: InsertRow<T> | InsertRow<T>[],
    options: { onConflict: string; ignoreDuplicates?: boolean },
  ) {
    this.#op = 'upsert';
    this.#payload = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
    this.#onConflict = options.onConflict;
    this.#ignoreDuplicates = options.ignoreDuplicates === true;
    return this;
  }

  delete() {
    this.#op = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    const col = `${ident(this.table)}.${ident(column)}`;
    this.#filters.push(
      value === null
        ? { sql: `${col} IS NULL`, params: [] }
        : { sql: `${col} = ?`, params: [toDb(this.table, column, value)] },
    );
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    const col = `${ident(this.table)}.${ident(column)}`;
    this.#filters.push(
      values.length === 0
        ? { sql: '0 = 1', params: [] }
        : {
            sql: `${col} IN (${values.map(() => '?').join(', ')})`,
            params: values.map((v) => toDb(this.table, column, v)),
          },
    );
    return this;
  }

  /** Only `not(column, 'is', null)` is supported (what the callers need). */
  not(column: string, operator: 'is', value: null) {
    if (operator !== 'is' || value !== null) throw new Error('unsupported filter');
    this.#filters.push({ sql: `${ident(this.table)}.${ident(column)} IS NOT NULL`, params: [] });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.#orders.push(
      `${ident(this.table)}.${ident(column)} ${options.ascending === false ? 'DESC' : 'ASC'}`,
    );
    return this;
  }

  limit(n: number) {
    this.#limit = Math.max(0, Math.floor(n));
    return this;
  }

  /** Inclusive row range, like `range(0, 24)` for the first 25 rows. */
  range(from: number, to: number) {
    this.#offset = Math.max(0, Math.floor(from));
    this.#limit = Math.max(0, Math.floor(to) - this.#offset + 1);
    return this;
  }

  maybeSingle() {
    this.#shape = 'maybe';
    return this as unknown as PromiseLike<DbResult<Out<T> | null>>;
  }

  single() {
    this.#shape = 'single';
    return this as unknown as PromiseLike<DbResult<Out<T>>>;
  }

  then<R1 = DbResult<Out<T>[]>, R2 = never>(
    onfulfilled?: ((value: DbResult<Out<T>[]>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.#run().then(onfulfilled, onrejected);
  }

  // ---------------------------------------------------------------------------------------------

  #where(): { sql: string; params: unknown[] } {
    if (this.#filters.length === 0) return { sql: '', params: [] };
    return {
      sql: ` WHERE ${this.#filters.map((f) => `(${f.sql})`).join(' AND ')}`,
      params: this.#filters.flatMap((f) => f.params),
    };
  }

  #stmt(sql: string, params: unknown[]): SqlStatement {
    if (params.length > MAX_PARAMS) throw new Error('too many bound parameters for one statement');
    return this.db.prepare(sql).bind(...params);
  }

  async #run(): Promise<DbResult<any>> {
    try {
      const rows = this.#op === 'select' ? await this.#runSelect() : await this.#runWrite();
      return this.#shapeResult(rows.data, rows.count);
    } catch (error) {
      return { data: null, error: toDbError(error), count: null };
    }
  }

  #shapeResult(rows: any[] | null, count: number | null): DbResult<any> {
    if (rows === null) return { data: null, error: null as never, count } as DbResult<any>;
    if (this.#shape === 'many') return { data: rows, error: null, count };
    if (rows.length === 0 && this.#shape === 'maybe')
      return { data: null as never, error: null, count };
    if (rows.length !== 1) {
      return {
        data: null,
        error: { code: 'PGRST116', message: `expected one row, got ${rows.length}` },
        count: null,
      };
    }
    return { data: rows[0], error: null, count };
  }

  async #runSelect(): Promise<{ data: any[]; count: number | null }> {
    const table = this.table;
    const { columns, embeds } = parseSelect(table, this.#columns);
    const where = this.#where();

    let count: number | null = null;
    if (this.#count) {
      const res = await this.#stmt(
        `SELECT COUNT(*) AS n FROM ${ident(table)}${where.sql}`,
        where.params,
      ).all();
      count = Number((res.results?.[0] as { n: number } | undefined)?.n ?? 0);
    }
    if (this.#head) return { data: [], count };

    const qualify = embeds.length > 0;
    const select: string[] = columns.map((c) =>
      c === '*'
        ? qualify
          ? `${ident(table)}.*`
          : '*'
        : qualify
          ? `${ident(table)}.${ident(c)}`
          : ident(c),
    );
    let joins = '';
    for (const e of embeds) {
      const alias = ident(`e${e.n}`);
      joins += ` LEFT JOIN ${ident(e.table)} AS ${alias} ON ${alias}."id" = ${ident(table)}.${ident(e.fk)}`;
      select.push(`${alias}."id" AS ${ident(`e${e.n}__id`)}`);
      for (const c of e.columns) select.push(`${alias}.${ident(c)} AS ${ident(`e${e.n}__${c}`)}`);
    }

    let sql = `SELECT ${select.join(', ')} FROM ${ident(table)}${joins}${where.sql}`;
    if (this.#orders.length > 0) sql += ` ORDER BY ${this.#orders.join(', ')}`;
    const limit = this.#limit ?? (this.#shape === 'many' ? null : 2);
    if (limit !== null) sql += ` LIMIT ${limit}`;
    if (this.#offset !== null) sql += ` OFFSET ${this.#offset}`;

    const res = await this.#stmt(sql, where.params).all();
    const data = ((res.results ?? []) as Record<string, unknown>[]).map((raw) => {
      const row: Record<string, unknown> = {};
      const embedded = new Map<number, Record<string, unknown>>();
      for (const [key, value] of Object.entries(raw)) {
        const m = /^e(\d+)__(.+)$/.exec(key);
        if (m) {
          const n = Number(m[1]);
          if (!embedded.has(n)) embedded.set(n, {});
          embedded.get(n)![m[2]] = value;
        } else row[key] = value;
      }
      fromDb(table, row);
      for (const e of embeds) {
        const raw = embedded.get(e.n) ?? {};
        if (raw.id === null || raw.id === undefined) {
          row[e.key] = null;
          continue;
        }
        const out: Record<string, unknown> = {};
        for (const c of e.columns) out[c] = raw[c];
        row[e.key] = fromDb(e.table, out);
      }
      return row;
    });
    return { data, count };
  }

  async #runWrite(): Promise<{ data: any[] | null; count: number | null }> {
    const table = this.table;
    const t = info(table);
    const op = this.#op;
    const before: SqlStatement[] = [];
    const after: SqlStatement[] = [];
    let write: SqlStatement;

    if (op === 'insert' || op === 'upsert') {
      const rows = this.#payload.map((row) => {
        const copy: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) if (v !== undefined) copy[k] = v;
        if (t.uuid && copy.id === undefined) copy.id = crypto.randomUUID();
        return copy;
      });
      if (rows.length === 0) throw new Error('nothing to insert');
      const keys = Object.keys(rows[0]);
      if (rows.some((r) => Object.keys(r).length !== keys.length || keys.some((k) => !(k in r)))) {
        throw new Error('all rows must have the same columns');
      }
      const params = rows.flatMap((r) => keys.map((k) => toDb(table, k, r[k])));
      let sql =
        keys.length === 0
          ? `INSERT INTO ${ident(table)} DEFAULT VALUES`
          : `INSERT INTO ${ident(table)} (${keys.map(ident).join(', ')}) VALUES ${rows
              .map(() => `(${keys.map(() => '?').join(', ')})`)
              .join(', ')}`;
      if (op === 'upsert') {
        const conflict = this.#onConflict ?? '';
        const updates = keys.filter((k) => k !== conflict);
        sql +=
          this.#ignoreDuplicates || updates.length === 0
            ? ` ON CONFLICT (${ident(conflict)}) DO NOTHING`
            : ` ON CONFLICT (${ident(conflict)}) DO UPDATE SET ${updates
                .map((k) => `${ident(k)} = excluded.${ident(k)}`)
                .join(', ')}`;
      }
      if (this.#returning) sql += ` RETURNING ${this.#returningSql()}`;
      write = this.#stmt(sql, params);

      if (this.ctx.audit && t.audit !== false && !(op === 'upsert' && this.#ignoreDuplicates)) {
        for (const r of rows) {
          if (r.id === undefined) continue;
          const logged = this.#loggedColumns(keys);
          if (logged.length === 0) continue;
          after.push(
            this.#auditInsert(op === 'upsert' ? 'upsert' : 'insert', String(r.id), {
              new: Object.fromEntries(logged.map((k) => [k, r[k]])),
            }),
          );
        }
      }
    } else {
      const where = this.#where();
      if (where.sql === '') throw new Error(`${op} needs a filter`);
      if (op === 'update') {
        const row = this.#payload[0];
        const keys = Object.keys(row).filter((k) => row[k] !== undefined);
        if (keys.length === 0) throw new Error('nothing to update');
        let sql = `UPDATE ${ident(table)} SET ${keys.map((k) => `${ident(k)} = ?`).join(', ')}${where.sql}`;
        if (this.#returning) sql += ` RETURNING ${this.#returningSql()}`;
        write = this.#stmt(sql, [...keys.map((k) => toDb(table, k, row[k])), ...where.params]);

        const logged = this.ctx.audit && t.audit !== false ? this.#loggedColumns(keys) : [];
        if (logged.length > 0) {
          const oldPairs = logged.map((k) => `'${k}', ${ident(table)}.${ident(k)}`).join(', ');
          const changed = logged.map((k) => `${ident(table)}.${ident(k)} IS NOT ?`).join(' OR ');
          before.push(
            this.#stmt(
              `INSERT INTO "audit_logs" ("actor_id", "action", "table_name", "row_id", "changes") ` +
                `SELECT ?, 'update', ?, CAST(${ident(table)}."id" AS TEXT), ` +
                `json_object('old', json_object(${oldPairs}), 'new', json(?)) ` +
                `FROM ${ident(table)}${where.sql} AND (${changed})`,
              [
                this.ctx.actorId,
                table,
                JSON.stringify(Object.fromEntries(logged.map((k) => [k, row[k]]))),
                ...where.params,
                ...logged.map((k) => toDb(table, k, row[k])),
              ],
            ),
          );
        }
      } else {
        let sql = `DELETE FROM ${ident(table)}${where.sql}`;
        if (this.#returning) sql += ` RETURNING ${this.#returningSql()}`;
        write = this.#stmt(sql, where.params);
        if (this.ctx.audit && t.audit !== false) {
          before.push(
            this.#stmt(
              `INSERT INTO "audit_logs" ("actor_id", "action", "table_name", "row_id", "changes") ` +
                `SELECT ?, 'delete', ?, CAST(${ident(table)}."id" AS TEXT), NULL FROM ${ident(table)}${where.sql}`,
              [this.ctx.actorId, table, ...where.params],
            ),
          );
        }
      }
    }

    let results: { results?: unknown[] }[];
    if (before.length === 0 && after.length === 0) {
      results = [await write.all()];
      return this.#writeData(results[0]);
    }
    // One atomic batch: the change and its audit rows succeed or fail together.
    results = await this.db.batch([...before, write, ...after]);
    return this.#writeData(results[before.length]);
  }

  #writeData(result: { results?: unknown[] }) {
    if (!this.#returning) return { data: null, count: null };
    const rows = ((result.results ?? []) as Record<string, unknown>[]).map((r) =>
      fromDb(this.table, r),
    );
    return { data: rows, count: null };
  }

  #returningSql(): string {
    const cols = splitTop(this.#returning ?? '*');
    return cols.map((c) => (c === '*' ? '*' : ident(c))).join(', ');
  }

  /** Columns that go to the audit log: the changed ones, limited to the table's allow-list when it has one. */
  #loggedColumns(keys: string[]): string[] {
    const allow = info(this.table).audit;
    return keys.filter(
      (k) => k !== 'updated_at' && k !== 'id' && (Array.isArray(allow) ? allow.includes(k) : true),
    );
  }

  #auditInsert(action: string, rowId: string, changes: unknown): SqlStatement {
    return this.#stmt(
      `INSERT INTO "audit_logs" ("actor_id", "action", "table_name", "row_id", "changes") VALUES (?, ?, ?, ?, ?)`,
      [this.ctx.actorId, action, this.table, rowId, JSON.stringify(changes)],
    );
  }
}

export interface Db {
  from<T extends TableName>(table: T): Query<T>;
  /** Raw access for the few places that need it (sign-in, which never goes through the table registry). */
  readonly sql: SqlDatabase;
}

/** A handle on the database. Pass `{ actorId, audit: true }` for admin work, `{ actorId: null, audit: true }` for the form. */
export function createDb(sql: SqlDatabase, context: DbContext): Db {
  return {
    sql,
    from: <T extends TableName>(table: T) => new Query<T>(sql, context, table),
  };
}
