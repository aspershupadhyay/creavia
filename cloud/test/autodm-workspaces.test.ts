// Auto-DM per workspace against a real Postgres (docs/town/prd/foundation-workspaces-accounts.md, slice 2b part 2):
// the migration keeps what the first workspace had, no Auto-DM read or write reaches another workspace's rows whatever
// id or account it is given, an Instagram account belongs to one workspace, and a tracked link names its own.
// Needs TEST_DATABASE_URL; it runs in its own Postgres schema, so it never meets test/workspaces.test.ts's tables.
import pg from "pg";
import { pgClient } from "./pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSchema, useClient } from "@/lib/db";
import { SCHEMA } from "@/lib/schema";
import { asWorkspace, FOUNDING, forgetCount } from "@/lib/tenant";

const URL_ = process.env.TEST_DATABASE_URL;
const A = "w_alpha_test",
  B = "w_bravo_test";
const ACCOUNT = "17841400000000001";
const SPACE = "autodm_ws_test";
let pool: pg.Pool;
const q = async (text: string, values?: unknown[]) => (await pool.query(text, values as unknown[])).rows;

describe.skipIf(!URL_)("Auto-DM per workspace (Postgres)", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL_, max: 1, options: `-c search_path=${SPACE}` });
    await q(`drop schema if exists ${SPACE} cascade`);
    await q(`create schema ${SPACE}`);
    useClient(pgClient(pool));
  });
  afterAll(async () => {
    useClient(null);
    await q(`drop schema if exists ${SPACE} cascade`).catch(() => null);
    await pool?.end();
  });
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL_POOLED", "postgres://the-test-client"); // hasDb(); queries go to the test client
    vi.stubEnv("MCP_TOKEN", "a-test-master-key-of-32-characters!");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "an-instagram-app-secret");
  });

  it("the migration keeps the first workspace's Auto-DM history, and the keys gain the workspace", async () => {
    // a studio from before 006: its Auto-DM tables and a row in them
    const before = SCHEMA.findIndex((s) => s.startsWith("CREATE TABLE IF NOT EXISTS autodm_messages"));
    for (const stmt of SCHEMA.slice(0, before)) await q(stmt);
    await q("insert into autodm_events (account, kind, ref, status) values ('acct', 'comment', 'c1', 'sent')");
    useClient(pgClient(pool));
    await ensureSchema();
    expect(await q("select workspace_id from autodm_events")).toEqual([{ workspace_id: FOUNDING }]);
    await expect(q("insert into autodm_leads (account, from_id, email) values ('a', 'b', 'c@d.e')")).rejects.toThrow(
      /workspace_id/,
    );
    // the same comment can be someone's in another workspace (an account that moved): not blocked by the old key
    await q(
      `insert into workspaces (id, name, key_prefix) values ($1, 'Alpha', $2), ($3, 'Bravo', $4) on conflict do nothing`,
      [A, `w/${A}/`, B, `w/${B}/`],
    );
    await q(
      "insert into autodm_events (account, kind, ref, status, workspace_id) values ('acct', 'comment', 'c1', 'sent', $1)",
      [A],
    );
    useClient(pgClient(pool));
    await ensureSchema(); // runs again safely
    forgetCount();
  });

  it("no read or write reaches another workspace's rows", async () => {
    const DB = await import("@/lib/publish/dmstore");
    const id = await asWorkspace(A, async () => {
      const id = await DB.claim({
        account: ACCOUNT,
        kind: "comment",
        ref: "c-77",
        automation: "auto1",
        automation_name: "Guide",
        from_id: "u1",
        text: "guide",
      });
      await DB.finish(id!, { status: "sent", links: ["https://example.com/guide"] });
      await DB.logMessage({ account: ACCOUNT, psid: "p1", dir: "in", text: "hi", mid: "m1" });
      await DB.addLead({
        account: ACCOUNT,
        from_id: "u1",
        from_name: "U",
        email: "u1@example.com",
        automation: "auto1",
        automation_name: "Guide",
        event: id,
      });
      return id!;
    });
    await asWorkspace(B, async () => {
      expect(await DB.getEvent(id)).toBeNull();
      expect(await DB.activity({})).toEqual([]);
      expect(await DB.activity({ account: ACCOUNT })).toEqual([]);
      expect(await DB.stats(30)).toEqual({});
      expect((await DB.totals(30)).sent).toBe(0);
      expect(await DB.leads({})).toEqual([]);
      expect(await DB.contacts({})).toEqual([]);
      expect((await DB.inbox({ view: "all" })).people).toEqual([]);
      expect((await DB.thread(ACCOUNT, "p1")).messages).toEqual([]);
      expect(await DB.click(id, true)).toBeNull();
      await DB.finish(id, { status: "failed" });
      await DB.forgetPerson(ACCOUNT, "p1");
      // the same comment in this workspace is its own to answer
      expect(
        await DB.claim({
          account: ACCOUNT,
          kind: "comment",
          ref: "c-77",
          automation: null,
          automation_name: null,
          from_id: "u1",
          text: "guide",
        }),
      ).not.toBeNull();
    });
    await asWorkspace(A, async () => {
      const row = await DB.getEvent(id);
      expect(row?.status).toBe("sent");
      expect(row?.clicks).toBe(0);
      expect((await DB.thread(ACCOUNT, "p1")).messages).toHaveLength(1);
      expect(await DB.leads({})).toHaveLength(1);
      expect(
        await DB.claim({
          account: ACCOUNT,
          kind: "comment",
          ref: "c-77",
          automation: null,
          automation_name: null,
          from_id: "u1",
          text: "again",
        }),
      ).toBeNull();
    });
  });

  it("an Instagram account belongs to one workspace, and its deliveries go there", async () => {
    const { claimAccount, ownerOf, releaseAccount } = await import("@/lib/publish/owners");
    const acct = "17841400000000099";
    await asWorkspace(A, () => claimAccount("instagram", acct));
    await expect(asWorkspace(B, () => claimAccount("instagram", acct))).rejects.toThrow(/another workspace/);
    expect(await ownerOf("instagram", acct)).toBe(A);
    await asWorkspace(B, () => releaseAccount("instagram", acct)); // not B's to release
    expect(await q("select workspace_id from account_owners where account = $1", [acct])).toEqual([
      { workspace_id: A },
    ]);
    await asWorkspace(A, () => releaseAccount("instagram", acct));
    await asWorkspace(B, () => claimAccount("instagram", acct));
    expect(await ownerOf("instagram", acct)).toBe(B);
  });

  it("a tracked link names its workspace, and the first workspace's links are what they always were", async () => {
    const { readTrack, sign, trackUrl } = await import("@/lib/publish/autodm");
    const token = (u: string) => u.split("/l/")[1];
    const legacy = token(await asWorkspace(FOUNDING, () => trackUrl(42, 1)));
    expect(legacy).toBe(`${(42).toString(36)}-1-${sign(`l${(42).toString(36)}-1`, 12)}`);
    expect(readTrack(legacy)).toEqual({ workspace: FOUNDING, id: 42, k: 1 });
    const mine = token(await asWorkspace(A, () => trackUrl(42, 1)));
    expect(mine.startsWith(`${A}~`)).toBe(true);
    expect(readTrack(mine)).toEqual({ workspace: A, id: 42, k: 1 });
    expect(readTrack(mine.replace(A, B))).toBeNull();
    expect(readTrack(mine.slice(A.length + 1))).toBeNull(); // the bare token, as the first workspace's
  });
});
