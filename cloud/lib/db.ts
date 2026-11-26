// The workspace in Postgres on Neon: posts, comments, activity and media (schema: db/001_workspace.sql). Queries go over
// Neon's HTTP driver to the pooled endpoint, which suits short requests on the Worker. lib/data.ts reads and writes
// through here (listRows … deleteRow), and the browser's live board is a sealed Realtime query (liveQuery).
// (Appwrite held these until 2026-10-31: docs/MIGRATION.md.)
// Every row belongs to one workspace: each read, write and live query here is scoped to lib/tenant.ts's answer, so no
// caller can reach another workspace's rows, whatever id it sends (docs/town/prd/foundation-workspaces-accounts.md).
import { AsyncLocalStorage } from "node:async_hooks";
import { neon } from "@neondatabase/serverless";
import { setResolvers, workspaceId } from "./tenant";
import { fromPg } from "./workspace";

/** A refusal with an HTTP status (a missing row is 404, a bad query 400). */
export class DataError extends Error {
  constructor(message: string, public status: number, public type = "") { super(message); }
}

const URL_ = () => process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || "";
export const hasDb = () => !!URL_();

/** What this file needs from a Postgres client: a query with $1… values, answered with rows; and several queries as one
 *  transaction (the row lock below needs it). */
export type SqlClient = {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
  transaction?: (queries: { text: string; values?: unknown[] }[]) => Promise<unknown[]>;
};
let client: SqlClient | null = null;
let locked: SqlClient | null = null;
/** The database, with the row lock on (below). */
export function sql(): SqlClient {
  if (locked) return locked;
  if (!client) {
    if (!hasDb()) throw new Error("The database is not configured (DATABASE_URL_POOLED).");
    const n = neon(URL_());
    client = {
      query: (text, values) => n.query(text, values ?? []),
      transaction: (qs) => n.transaction((tx) => qs.map((q) => tx.query(q.text, q.values ?? []))),
    };
  }
  return (locked = withRowLock(client));
}
/** Tests: talk to a local Postgres instead of Neon. */
export function useClient(c: SqlClient | null) {
  client = c;
  locked = null;
  lockReady = null;
  schema = null;
}

// ── the second lock (db/009_row_security.sql; PRD slice 4)
// Every query that touches a workspace table runs as the role creavia_workspace in a transaction that first names the
// request's workspace, so Postgres itself returns and accepts only that workspace's rows: a query that forgets its
// "workspace_id = $w" still can't reach another's. No workspace (a caller with nobody named): nothing. Work for the
// whole service (making the tables, the nightly backup, the retention clean-up) says so with asService.
const WORKSPACE_TABLES = /\b(posts|comments|activity|media|autodm_events|autodm_leads|autodm_messages|autodm_people)\b/i;
const service = new AsyncLocalStorage<true>();
/** Runs fn as the service as a whole, outside the row lock: only for work that is about every workspace at once. */
export const asService = <T>(fn: () => Promise<T>): Promise<T> => service.run(true, fn);

let lockReady: Promise<boolean> | null = null;
/** Is the lock's role there for this connection? Asked once per server instance; without it the lock stays off and
 *  says so (the app scopes every query by workspace either way). */
function lockOn(raw: SqlClient) {
  return (lockReady ??= raw
    .query("select pg_has_role(current_user, 'creavia_workspace', 'MEMBER') as ok where exists (select 1 from pg_roles where rolname = 'creavia_workspace')")
    .then((r) => {
      const ok = (r as { ok: boolean }[])[0]?.ok === true;
      if (!ok) console.warn("row lock off: the database has no creavia_workspace role (db/009_row_security.sql)");
      return ok;
    })
    .catch(() => {
      lockReady = null;
      return false;
    }));
}

function withRowLock(raw: SqlClient): SqlClient {
  return {
    ...raw,
    query: async (text, values) => {
      if (!raw.transaction || service.getStore() || !WORKSPACE_TABLES.test(text) || !(await lockOn(raw))) return raw.query(text, values);
      const w = await workspaceId().catch(() => ""); // none: the lock lets nothing through
      const out = await raw.transaction([
        { text: "select set_config('app.workspace', $1, true)", values: [w] },
        { text: "set local role creavia_workspace" },
        { text, values },
      ]);
      return out[2];
    },
  };
}

setResolvers({
  session: async () => (await import("./session")).sessionWorkspace(),
  // no database configured: only the one studio there always was can exist
  workspaceCount: async () => (!hasDb() && !client ? 1 : Number(((await sql().query("select count(*)::int n from workspaces")) as { n: number }[])[0]?.n ?? 0)),
});

let schema: Promise<void> | null = null;
/** A fresh studio makes its own tables (db/*.sql via lib/schema.ts, all IF NOT EXISTS), once per server instance, so
 *  one-click deploys need no terminal step. Called where a new studio is first used: sign-in, the workspace API, MCP. */
export function ensureSchema() {
  if (!hasDb() && !client) return Promise.resolve();
  return (schema ??= (async () => {
    const { SCHEMA } = await import("./schema");
    const q = sql();
    // the tables themselves are the service's (the lock's role can't make them)
    await asService(async () => { for (const stmt of SCHEMA) await q.query(stmt); });
    lockReady = null; // the lock's role may be new: ask again
  })().catch((e) => { schema = null; throw e; }));
}

const TABLES = {
  posts: ["title", "status", "platforms", "script", "caption", "notes", "due_at", "posted_at", "link", "owner_id", "owner_name", "assignee_id", "assignee_name", "jobs", "cover"],
  comments: ["post_id", "body", "author_id", "author_name"],
  activity: ["post_id", "verb", "text", "actor_id", "actor_name"],
  media: ["file_id", "name", "mime", "size", "kind", "post_id", "uploaded_by", "uploaded_name", "r2_key", "token"],
} as const;
export type Table = keyof typeof TABLES;
export const isTable = (t: unknown): t is Table => typeof t === "string" && t in TABLES;
const ARRAYS = new Set(["platforms", "jobs"]);

// ── reads and writes

/** Query objects ({method, attribute, values}, the JSON components/aw.ts' Query builds in the browser), as SQL on
 *  allowed columns only. What the studio asks for: equal, the four comparisons, isNull/isNotNull, order and limit. */
export type Q = { method: string; attribute?: string; values?: unknown[] };
const OPS: Record<string, string> = { greaterThan: ">", greaterThanEqual: ">=", lessThan: "<", lessThanEqual: "<=", notEqual: "<>" };
export function toSql(table: Table, queries: Q[], workspace: string, maxLimit = 1000) {
  const col = (a = "") => {
    const c = a === "$id" ? "id" : a === "$createdAt" ? "created_at" : a === "$updatedAt" ? "updated_at" : a;
    if (c === "id" || c === "created_at" || c === "updated_at" || (TABLES[table] as readonly string[]).includes(c)) return c;
    throw new DataError(`Unknown column ${a}`, 400);
  };
  const where: string[] = [], order: string[] = [], values: unknown[] = [];
  let limit = 25;
  const at = (v: unknown) => { values.push(v); return `$${values.length}`; };
  where.push(`workspace_id = ${at(workspace)}`); // always first, never optional
  for (const x of queries) {
    const v = x.values ?? [];
    if (x.method === "equal") where.push(v.length ? `${col(x.attribute)} in (${v.map(at).join(", ")})` : "false");
    else if (OPS[x.method]) where.push(`${col(x.attribute)} ${OPS[x.method]} ${at(v[0])}`);
    else if (x.method === "isNull" || x.method === "isNotNull") where.push(`${col(x.attribute)} is ${x.method === "isNull" ? "" : "not "}null`);
    else if (x.method === "orderAsc" || x.method === "orderDesc") order.push(`${col(x.attribute)} ${x.method === "orderAsc" ? "asc" : "desc"}`);
    else if (x.method === "limit") limit = Math.max(1, Math.min(maxLimit, Number(v[0]) || 25));
    else throw new DataError(`Unsupported query ${x.method}`, 400);
  }
  const text = `select * from ${table}${where.length ? ` where ${where.join(" and ")}` : ""} order by ${[...order, "id"].join(", ")} limit ${limit}`;
  return { text, values };
}

const shaped = <T>(table: Table, rows: unknown) => (rows as Record<string, unknown>[]).map((r) => fromPg<T>(table, r));
const pick = (table: Table, data: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const c of TABLES[table]) if (data[c] !== undefined) out[c] = ARRAYS.has(c) ? (data[c] as unknown[] | null) ?? [] : data[c];
  return out;
};
/** A row id: 20 hex characters, time first. */
export const newId = () => Date.now().toString(16).padStart(12, "0").slice(-12) + [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function listRows<T>(table: Table, queries: Q[]) {
  const { text, values } = toSql(table, queries, await workspaceId());
  return shaped<T>(table, await sql().query(text, values));
}

// by id: always "and workspace_id = …", so another workspace's id reads as missing (404), never as its row
export async function getRow<T>(table: Table, id: string) {
  const [row] = shaped<T>(table, await sql().query(`select * from ${table} where id = $1 and workspace_id = $2`, [id, await workspaceId()]));
  if (!row) throw new DataError("Row with the requested ID could not be found.", 404, "row_not_found");
  return row;
}

export async function insertRow<T>(table: Table, data: Record<string, unknown>, id = newId()) {
  const d = pick(table, data);
  const cols = ["id", "workspace_id", ...Object.keys(d)];
  const [row] = shaped<T & { $id: string }>(table, await sql().query(`insert into ${table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning *`, [id, await workspaceId(), ...Object.values(d)]));
  return row as T;
}

export async function patchRow<T>(table: Table, id: string, data: Record<string, unknown>) {
  const d = pick(table, data);
  const sets = Object.keys(d).map((c, i) => `${c} = $${i + 3}`);
  const [row] = shaped<T>(table, await sql().query(`update ${table} set ${[...sets, "updated_at = now()"].join(", ")} where id = $1 and workspace_id = $2 returning *`, [id, await workspaceId(), ...Object.values(d)]));
  if (!row) throw new DataError("Row with the requested ID could not be found.", 404, "row_not_found");
  return row;
}

export async function deleteRow(table: Table, id: string) {
  await sql().query(`delete from ${table} where id = $1 and workspace_id = $2`, [id, await workspaceId()]);
}

/** A live query for the browser (Neon Realtime): sealed here, so the browser can watch exactly these rows and nothing
 *  else, without the secret. Short-lived; the browser asks again when it goes stale. */
export async function liveQuery(table: Table, queries: Q[]) {
  const secret = process.env.NEON_REALTIME_SECRET, url = process.env.NEON_REALTIME_URL;
  if (!secret || !url) return null;
  const { createRealtime, rawSql } = await import("@neon/realtime/server");
  const { text, values } = toSql(table, queries, await workspaceId());
  const query = await createRealtime({ secret, db: process.env.NEON_DB_NAME || "neondb" }).seal({ query: rawSql(text, values as never) });
  return { url, query };
}
