// The isolation sweep (docs/town/prd/foundation-workspaces-accounts.md, slice 4): every MCP tool is called from one
// workspace with another workspace's real ids (its post, comment, media row, Instagram account and person) in every
// id-like argument, and must neither show any of that workspace's content nor change it. Errors are fine (most tools
// refuse an id they can't find); a leak or a change is a failure. Runs on a real Postgres with the row lock on and an
// in-memory bucket; nothing reaches the network (test/setup.ts).
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryBucket } from "./bucket";
import { pgClient } from "./pg";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", () => ({ after: () => undefined }));

const { ensureSchema, insertRow, useClient } = await import("@/lib/db");
const { asWorkspace, forgetCount } = await import("@/lib/tenant");

const URL_ = process.env.TEST_DATABASE_URL;
const SPACE = "isolation_sweep_test";
const A = "w_alpha_sweep",
  B = "w_bravo_sweep";
const MARK = "ALPHA-ONLY-7f3c"; // in every piece of A's content: it must never come back to B
const ACCOUNT = "17841400000077777";
const CONTEXT = Symbol.for("__cloudflare-context__");
let pool: pg.Pool;
const q = async (text: string, values?: unknown[]) => (await pool.query(text, values as unknown[])).rows;

type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<unknown>;
type Tool = { name: string; schema: unknown; run: Handler };

/** Every tool the MCP serves, registered as app/api/mcp does it (guarded), caught instead of served. */
async function allTools(): Promise<Tool[]> {
  const tools: Tool[] = [];
  const fake = new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === "registerTool"
          ? (name: string, config: { inputSchema?: unknown }, run: Handler) =>
              void tools.push({ name, schema: config.inputSchema, run })
          : () => undefined,
    },
  );
  const { guarded } = await import("@/lib/auto/wrap");
  (await import("@/lib/mcptools")).registerTools(guarded(fake as never));
  (await import("@/lib/auto/tools")).registerAutoTools(guarded(fake as never));
  return tools;
}

/** The argument names a tool takes (from its zod object schema). */
const keysOf = (schema: unknown): string[] => {
  const shape = (schema as { shape?: Record<string, unknown> } | undefined)?.shape;
  return shape ? Object.keys(shape) : [];
};

describe.skipIf(!URL_)("isolation sweep: every MCP tool, with another workspace's ids", () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL_, max: 2, options: `-c search_path=${SPACE}` });
    await q(`drop schema if exists ${SPACE} cascade`);
    await q(`create schema ${SPACE}`);
  });
  afterAll(async () => {
    useClient(null);
    delete (globalThis as Record<symbol, unknown>)[CONTEXT];
    await q(`drop schema if exists ${SPACE} cascade`).catch(() => null);
    await pool?.end();
  });
  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL_POOLED", "postgres://the-test-client");
    vi.stubEnv("MCP_TOKEN", "a-test-master-key-of-32-characters!");
    vi.stubEnv("R2_ACCOUNT_ID", "acct");
    vi.stubEnv("R2_ACCESS_KEY_ID", "id");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    (globalThis as Record<symbol, unknown>)[CONTEXT] = { env: { BUCKET: memoryBucket() } };
    useClient(pgClient(pool));
    await ensureSchema();
    await q(
      "insert into workspaces (id, name, key_prefix) values ($1, 'Alpha', $2), ($3, 'Bravo', $4) on conflict do nothing",
      [A, `w/${A}/`, B, `w/${B}/`],
    );
    forgetCount();
    // Alpha's content: a post, a comment on it, a media row, Auto-DM history and an inbox person
    await asWorkspace(A, async () => {
      const post = await insertRow<{ $id: string }>("posts", {
        title: `${MARK} plan`,
        script: `${MARK} script`,
        caption: `${MARK} caption`,
      });
      const comment = await insertRow<{ $id: string }>("comments", {
        post_id: post.$id,
        body: `${MARK} note`,
        author_name: "Ana",
      });
      const media = await insertRow<{ $id: string }>("media", {
        file_id: "f-alpha",
        name: `${MARK}.png`,
        mime: "image/png",
        size: 10,
        post_id: post.$id,
      });
      const DB = await import("@/lib/publish/dmstore");
      const ev = await DB.claim({
        account: ACCOUNT,
        kind: "comment",
        ref: "c-1",
        automation: "auto1",
        automation_name: `${MARK} flow`,
        from_id: "u1",
        text: `${MARK} comment`,
      });
      await DB.logMessage({ account: ACCOUNT, psid: "p1", dir: "in", text: `${MARK} dm`, mid: "m1", username: "ana" });
      Object.assign(ids, { post: post.$id, comment: comment.$id, media: media.$id, event: String(ev) });
    });
  });

  /** Calls every tool from workspace w with Alpha's ids; answers the tools whose answer had Alpha's content. */
  const sweep = async (tools: Tool[], w: string) => {
    const leaks: string[] = [];
    for (const t of tools) {
      const args: Record<string, unknown> = {};
      for (const k of keysOf(t.schema)) {
        if (/^(post_id|post|id)$/.test(k)) args[k] = ids.post;
        else if (/comment/.test(k)) args[k] = ids.comment;
        else if (/media|file_id/.test(k)) args[k] = ids.media;
        else if (/ids$/.test(k)) args[k] = [ids.post, ids.media, ids.comment];
        else if (/account/.test(k)) args[k] = ACCOUNT;
        else if (/psid|person/.test(k)) args[k] = "p1";
        else if (/event/.test(k)) args[k] = ids.event;
      }
      for (const action of ["get", "list", "read", "thread", "inbox", "activity", "contacts", "leads"]) {
        if (!keysOf(t.schema).includes("action")) break;
        const out = await asWorkspace(w, () =>
          Promise.race([
            t.run({ ...args, action }, {}).catch((e: Error) => ({ error: e.message })),
            new Promise((r) => setTimeout(() => r({ timeout: true }), 1500)),
          ]),
        );
        if (JSON.stringify(out ?? null).includes(MARK)) leaks.push(`${t.name} (${action})`);
      }
      const out = await asWorkspace(w, () =>
        Promise.race([
          t.run(args, {}).catch((e: Error) => ({ error: e.message })),
          new Promise((r) => setTimeout(() => r({ timeout: true }), 1500)),
        ]),
      );
      if (JSON.stringify(out ?? null).includes(MARK)) leaks.push(t.name);
    }
    return leaks;
  };

  it("no tool shows or changes another workspace's posts, comments, media or Auto-DM", async () => {
    const tools = await allTools();
    expect(tools.length).toBeGreaterThan(80); // the whole registry, not a part of it
    const before = await q("select id, title, script, caption, updated_at from posts order by id");
    const leaks = await sweep(tools, B);
    expect(leaks).toEqual([]);
    // and Alpha's rows are as they were: nothing Bravo called changed or deleted them
    expect(await q("select id, title, script, caption, updated_at from posts order by id")).toEqual(before);
    expect(await q("select count(*)::int n from comments where workspace_id = $1", [A])).toEqual([{ n: 1 }]);
    expect(await q("select count(*)::int n from media where workspace_id = $1", [A])).toEqual([{ n: 1 }]);
    expect(await q("select count(*)::int n from autodm_events where workspace_id = $1", [A])).toEqual([{ n: 1 }]);
    // and nothing Bravo did was written into Alpha's workspace
    expect(await q("select count(*)::int n from posts where workspace_id = $1", [A])).toEqual([{ n: 1 }]);
    // the control, last (Alpha's own tools may change its rows): from Alpha itself the same calls do find Alpha's
    // content, so the sweep reaches real data and a leak would show
    const own = await sweep(tools, A);
    expect(own.length).toBeGreaterThan(3);
  }, 300_000);
});
