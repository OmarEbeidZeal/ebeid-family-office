/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A small in-memory stand-in for the database client, for testing the repairs.
 *
 * Merging accounts, re-filing a statement and starting a file over all delete
 * real financial rows. That is exactly the code that should not be tested by
 * running it against the household's data and looking at the result, so the
 * queries run here instead, against tables held in memory, where a wrong filter
 * shows up as the wrong rows surviving rather than as a row that is gone.
 *
 * It implements only the slice of PostgREST the repair code uses: filtered
 * selects with ordering, paging and exact counts, updates, deletes, inserts and
 * `maybeSingle`. Anything else throws rather than quietly passing.
 */

export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;

type Filter = (row: Row) => boolean;

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `generated-${sequence}`;
}

class Query implements PromiseLike<{ data: any; error: any; count?: number | null }> {
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitTo: number | null = null;
  private rangeAt: { from: number; to: number } | null = null;
  private wantCount = false;
  private headOnly = false;
  private singleRow: "maybe" | "one" | null = null;

  constructor(
    private readonly db: Tables,
    private readonly table: string,
    private readonly op: "select" | "update" | "delete" | "insert",
    private readonly payload?: Row | Row[],
  ) {}

  private rows(): Row[] {
    if (!this.db[this.table]) this.db[this.table] = [];
    return this.db[this.table]!;
  }

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (options?.count) this.wantCount = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  in(column: string, values: unknown[]) {
    const set = new Set(values);
    this.filters.push((row) => set.has(row[column]));
    return this;
  }

  is(column: string, value: null) {
    if (value !== null) throw new Error("fake client: only `is(column, null)` is supported");
    this.filters.push((row) => row[column] === null || row[column] === undefined);
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator !== "is" || value !== null) {
      throw new Error("fake client: only `not(column, 'is', null)` is supported");
    }
    this.filters.push((row) => row[column] !== null && row[column] !== undefined);
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push((row) => row[column] >= value);
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push((row) => row[column] <= value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.limitTo = count;
    return this;
  }

  range(from: number, to: number) {
    this.rangeAt = { from, to };
    return this;
  }

  maybeSingle() {
    this.singleRow = "maybe";
    return this;
  }

  single() {
    this.singleRow = "one";
    return this;
  }

  private matched(): Row[] {
    return this.rows().filter((row) => this.filters.every((keep) => keep(row)));
  }

  private run(): { data: any; error: any; count?: number | null } {
    if (this.op === "insert") {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      const created = incoming.map((row) => ({ id: row["id"] ?? nextId(), ...row }));
      this.rows().push(...created);
      return this.shape(created);
    }

    const matched = this.matched();

    if (this.op === "delete") {
      const doomed = new Set(matched);
      this.db[this.table] = this.rows().filter((row) => !doomed.has(row));
      return this.shape(matched);
    }

    if (this.op === "update") {
      for (const row of matched) Object.assign(row, this.payload);
      return this.shape(matched);
    }

    let rows = [...matched];
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows.sort((left, right) => {
        const a = left[column];
        const b = right[column];
        if (a === b) return 0;
        const smaller = (a ?? "") < (b ?? "");
        return (smaller ? -1 : 1) * (ascending ? 1 : -1);
      });
    }
    const total = rows.length;
    if (this.rangeAt) rows = rows.slice(this.rangeAt.from, this.rangeAt.to + 1);
    if (this.limitTo !== null) rows = rows.slice(0, this.limitTo);

    if (this.headOnly) return { data: null, error: null, count: this.wantCount ? total : null };
    return { ...this.shape(rows), count: this.wantCount ? total : null };
  }

  private shape(rows: Row[]): { data: any; error: any } {
    if (this.singleRow) {
      const first = rows[0] ?? null;
      if (this.singleRow === "one" && !first) {
        return { data: null, error: { message: "no rows returned" } };
      }
      return { data: first ? { ...first } : null, error: null };
    }
    return { data: rows.map((row) => ({ ...row })), error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onFulfilled?:
      | ((value: { data: any; error: any; count?: number | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    try {
      return Promise.resolve(this.run()).then(onFulfilled, onRejected);
    } catch (error) {
      return Promise.reject(error).then(onFulfilled, onRejected);
    }
  }
}

export type FakeSupabase = {
  from: (table: string) => {
    select: (columns?: string, options?: { count?: string; head?: boolean }) => Query;
    insert: (payload: Row | Row[]) => Query;
    update: (payload: Row) => Query;
    delete: () => Query;
  };
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: null; error: null }>;
  /** Every stored procedure the code under test asked the database to run. */
  calls: Array<{ name: string; args?: Record<string, unknown> }>;
  tables: Tables;
};

export function fakeSupabase(seed: Tables): FakeSupabase {
  const tables: Tables = {};
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = rows.map((row) => ({ ...row }));
  }
  const calls: FakeSupabase["calls"] = [];

  return {
    tables,
    calls,
    from(table: string) {
      return {
        select: (columns?: string, options?: { count?: string; head?: boolean }) =>
          new Query(tables, table, "select").select(columns, options),
        insert: (payload: Row | Row[]) => new Query(tables, table, "insert", payload),
        update: (payload: Row) => new Query(tables, table, "update", payload),
        delete: () => new Query(tables, table, "delete"),
      };
    },
    async rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ name, args: args ?? {} });
      return { data: null, error: null };
    },
  };
}
