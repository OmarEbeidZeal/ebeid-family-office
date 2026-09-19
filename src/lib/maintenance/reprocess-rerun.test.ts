/**
 * Pressing "read every document again" twice.
 *
 * A step that fails halfway leaves the household half-cleared. That is only
 * acceptable if pressing the button again finishes the job and lands in exactly
 * the state a clean run would have. This runs the real function against an
 * in-memory stand-in for the database: once cleanly, and once interrupted then
 * resumed, and compares what is left.
 */
import { describe, expect, it } from "vitest";
import { reprocessAllDocuments } from "./reprocess.server";

type Row = Record<string, any>;

/** Just enough of the query surface this module uses, over plain arrays. */
function fakeClient(tables: Record<string, Row[]>, objects: Record<string, string[]>, failAt?: number) {
  let mutations = 0;

  const builder = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let op: "select" | "delete" | "update" | "insert" = "select";
    let payload: Row = {};
    let head = false;
    let counting = false;
    let single = false;

    const run = () => {
      const rows = tables[table] ?? (tables[table] = []);
      const matched = rows.filter((row) => filters.every((test) => test(row)));

      if (op === "delete" || op === "update") {
        mutations += 1;
        if (failAt && mutations === failAt) return { data: null, error: { message: "network" } };
      }

      if (op === "delete") {
        tables[table] = rows.filter((row) => !matched.includes(row));
        return { data: matched.map((row) => ({ id: row["id"] })), error: null };
      }
      if (op === "update") {
        for (const row of matched) Object.assign(row, payload);
        return { data: matched.map((row) => ({ id: row["id"] })), error: null };
      }
      if (op === "insert") {
        const row = { id: `run-${rows.length + 1}`, ...payload };
        rows.push(row);
        return { data: { id: row["id"] }, error: null };
      }
      if (counting) return { data: null, count: matched.length, error: null };
      if (single) return { data: matched[0] ?? null, error: null };
      return { data: head ? null : matched, count: matched.length, error: null };
    };

    const api: any = {
      select: (_cols?: string, options?: { count?: string; head?: boolean }) => {
        if (options?.head) {
          head = true;
          counting = true;
        }
        return api;
      },
      delete: () => {
        op = "delete";
        return api;
      },
      update: (next: Row) => {
        op = "update";
        payload = next;
        return api;
      },
      insert: (next: Row) => {
        op = "insert";
        payload = next;
        return api;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return api;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return api;
      },
      not: (column: string, _operator: string, _value: unknown) => {
        filters.push((row) => row[column] !== null && row[column] !== undefined);
        return api;
      },
      order: () => api,
      limit: () => api,
      range: () => api,
      maybeSingle: () => {
        single = true;
        return Promise.resolve(run());
      },
      then: (resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return api;
  };

  return {
    from: (table: string) => builder(table),
    storage: {
      from: (bucket: string) => ({
        list: (prefix: string) =>
          Promise.resolve({
            data: (objects[bucket] ?? [])
              .filter((path) => path.startsWith(`${prefix}/`))
              .map((path) => ({ name: path.slice(prefix.length + 1), id: "obj" }))
              .filter((entry) => !entry.name.includes("/")),
            error: null,
          }),
        remove: (paths: string[]) => {
          objects[bucket] = (objects[bucket] ?? []).filter((path) => !paths.includes(path));
          return Promise.resolve({ error: null });
        },
      }),
    },
  };
}

const HOUSEHOLD = "h1";

function seed() {
  const tables: Record<string, Row[]> = {
    statements: [
      {
        id: "s1",
        household_id: HOUSEHOLD,
        status: "imported",
        locked_at: null,
        account_id: "a1",
        proposal_id: "p1",
        file_path: `${HOUSEHOLD}/one.csv`,
        storage_bucket: "statements",
        transaction_count: 12,
      },
      {
        id: "s2",
        household_id: HOUSEHOLD,
        status: "duplicate",
        locked_at: null,
        account_id: null,
        proposal_id: null,
        file_path: `${HOUSEHOLD}/two.csv`,
        storage_bucket: "statements",
      },
    ],
    transactions: [
      { id: "t1", household_id: HOUSEHOLD, statement_id: "s1" },
      { id: "t2", household_id: HOUSEHOLD, statement_id: null },
    ],
    transaction_splits: [{ id: "sp1", transaction_id: "t1" }],
    trades: [{ id: "tr1", household_id: HOUSEHOLD, statement_id: "s1", holding_id: "h-1" }],
    holdings: [{ id: "h-1", household_id: HOUSEHOLD, discovered_from: "statement" }],
    account_identifiers: [{ id: "i1", household_id: HOUSEHOLD, source: "statement" }],
    account_proposals: [{ id: "p1", household_id: HOUSEHOLD }],
    accounts: [
      { id: "a1", household_id: HOUSEHOLD, discovered_from: "statement" },
      { id: "a2", household_id: HOUSEHOLD, discovered_from: "manual" },
    ],
    advisor_notes: [{ id: "n1", household_id: HOUSEHOLD }],
    net_worth_snapshots: [
      { id: "ns1", household_id: HOUSEHOLD, total_assets: 0, total_liabilities: 0, breakdown: {} },
      { id: "ns2", household_id: HOUSEHOLD, total_assets: 100, total_liabilities: 0, breakdown: {} },
    ],
    documents: [],
    automation_runs: [],
  };

  const objects: Record<string, string[]> = {
    statements: [
      `${HOUSEHOLD}/one.csv`,
      `${HOUSEHOLD}/one.csv.extract.json`,
      `${HOUSEHOLD}/two.csv`,
      `${HOUSEHOLD}/stray-fixture.csv`,
    ],
    documents: [],
  };

  return { tables, objects };
}

/** What is left, reduced to the things a second run must agree on. */
function state(tables: Record<string, Row[]>, objects: Record<string, string[]>) {
  return {
    statements: tables["statements"]!.map((row) => ({
      id: row["id"],
      status: row["status"],
      account_id: row["account_id"],
      transaction_count: row["transaction_count"] ?? null,
    })),
    transactions: tables["transactions"]!.map((row) => row["id"]),
    splits: tables["transaction_splits"]!.map((row) => row["id"]),
    trades: tables["trades"]!.length,
    holdings: tables["holdings"]!.map((row) => row["id"]),
    identifiers: tables["account_identifiers"]!.length,
    proposals: tables["account_proposals"]!.length,
    accounts: tables["accounts"]!.map((row) => row["id"]),
    notes: tables["advisor_notes"]!.length,
    snapshots: tables["net_worth_snapshots"]!.map((row) => row["id"]),
    objects: objects["statements"]!.slice().sort(),
  };
}

describe("reading every document again", () => {
  it("clears only what the importer wrote, and requeues the rest", async () => {
    const { tables, objects } = seed();
    const client = fakeClient(tables, objects);
    const result = await reprocessAllDocuments(client, HOUSEHOLD, client);

    expect(result.transactions).toBe(1);
    expect(result.splits).toBe(1);
    expect(result.trades).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.requeued).toBe(1);

    // The household's own work survives; the file itself survives.
    expect(tables["accounts"]!.map((row) => row["id"])).toEqual(["a2"]);
    expect(tables["transactions"]!.map((row) => row["id"])).toEqual(["t2"]);
    expect(objects["statements"]).toContain(`${HOUSEHOLD}/one.csv`);
    expect(objects["statements"]).not.toContain(`${HOUSEHOLD}/one.csv.extract.json`);
    expect(objects["statements"]).not.toContain(`${HOUSEHOLD}/stray-fixture.csv`);
    expect(tables["statements"]![0]!["status"]).toBe("queued");
  });

  it("records the run through the service role, and says so when it cannot", async () => {
    const { tables, objects } = seed();
    const client = fakeClient(tables, objects);
    await reprocessAllDocuments(client, HOUSEHOLD, client);

    const runs = tables["automation_runs"]!;
    expect(runs).toHaveLength(1);
    expect(runs[0]!["job"]).toBe("reprocess");
    expect(runs[0]!["status"]).toBe("ok");

    const broken = {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }),
        insert: () => ({
          select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "denied" } }) }),
        }),
      }),
    } as any;
    const second = seed();
    await expect(
      reprocessAllDocuments(fakeClient(second.tables, second.objects), HOUSEHOLD, broken),
    ).rejects.toThrow(/could not be recorded/);
  });

  it("ends in the same state when a failed run is pressed again", async () => {
    const clean = seed();
    const cleanClient = fakeClient(clean.tables, clean.objects);
    await reprocessAllDocuments(cleanClient, HOUSEHOLD, cleanClient);
    const expected = state(clean.tables, clean.objects);

    // A run that dies on its third write, then the same button pressed again.
    const broken = seed();
    const failing = fakeClient(broken.tables, broken.objects, 3);
    await expect(reprocessAllDocuments(failing, HOUSEHOLD, failing)).rejects.toThrow();

    // Something was already deleted, so the database is mid-way through.
    const resumed = fakeClient(broken.tables, broken.objects);
    const result = await reprocessAllDocuments(resumed, HOUSEHOLD, resumed);

    expect(state(broken.tables, broken.objects)).toEqual(expected);
    expect(result.requeued).toBe(1);
  });
});
