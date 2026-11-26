// Workspaces against a real Postgres (docs/town/prd/foundation-workspaces-accounts.md, slice 1): the migration, and that
// no read, write or delete in lib/db.ts can reach another workspace's rows, whatever id it is given. Needs
// TEST_DATABASE_URL (a throwaway database: every run wipes it); CI starts one (checks.yml), and it fails there without it.
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteRow, ensureSchema, getRow, insertRow, listRows, patchRow, toSql, useClient } from "@/lib/db";
import { isMember, joinWorkspace, leaveWorkspace, forget as forgetMembers, workspaceMembers } from "@/lib/memberships";
import { asWorkspace, FOUNDING, forgetCount, NoWorkspace, workspaceId } from "@/lib/tenant";

const URL_ = process.env.TEST_DATABASE_URL;
if (process.env.CI && !URL_)
  throw new Error("TEST_DATABASE_URL must be set in CI: the workspace isolation tests need it");

const A = "w_alpha_test",
  B = "w_bravo_test";
let pool: pg.Pool;
const q = async (text: string, values?: unknown[]) => (await pool.query(text, values as unknown[])).rows;

describe.skipIf(!URL_)("workspaces (Postgres)", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL_, max: 2 });
    useClient({ query: q });
  });
  afterAll(async () => {
    useClient(null);
    await pool?.end();
  });

  beforeEach(async () => {
    // a fresh database each test: the real migrations (lib/schema.ts, from db/*.sql), as a new studio makes them
    await q("drop schema public cascade");
    await q("create schema public");
    useClient({ query: q });
    await ensureSchema();
    forgetCount();
    forgetMembers();
  });

  const twoWorkspaces = async () => {
    await q("insert into workspaces (id, name, key_prefix) values ($1, 'Alpha', $2), ($3, 'Bravo', $4)", [
      A,
      `w/${A}/`,
      B,
      `w/${B}/`,
    ]);
    forgetCount();
  };

  describe("the migration", () => {
    it("makes the first workspace and runs again safely", async () => {
      await ensureSchema(); // already made in beforeEach: a second run changes nothing
      useClient({ query: q });
      await ensureSchema();
      expect(await q("select id, key_prefix from workspaces")).toEqual([{ id: FOUNDING, key_prefix: "" }]);
    });

    it("refuses a row with no workspace, so a forgotten one can't land in the wrong place", async () => {
      await expect(q("insert into posts (id, title) values ('p1', 'x')")).rejects.toThrow(/workspace_id/);
    });

    it("puts today's team in the first workspace, the oldest as owner, and only once", async () => {
      const fresh = async () => {
        await q("drop schema public cascade");
        await q("create schema public");
        useClient({ query: q });
      };
      await fresh();
      // the studio as it was before workspaces: the first four migrations, a team, and a post
      const { SCHEMA } = await import("@/lib/schema");
      for (const stmt of SCHEMA.filter((s) => !/workspaces|memberships|invites|workspace_id/.test(s))) await q(stmt);
      await q(`insert into users (id, email, name, member, created_at) values
        ('u1', 'old@x.test', 'Old', true, now() - interval '1 day'), ('u2', 'new@x.test', 'New', true, now()),
        ('u3', 'gone@x.test', 'Gone', false, now())`);
      await q("insert into posts (id, title) values ('p1', 'before workspaces')");
      useClient({ query: q });
      await ensureSchema();
      expect(await q("select user_id, role from memberships order by user_id")).toEqual([
        { user_id: "u1", role: "owner" },
        { user_id: "u2", role: "member" },
      ]);
      expect(await q("select workspace_id from posts")).toEqual([{ workspace_id: FOUNDING }]);
      // an account made later is not swept in by the next start
      await q("insert into users (id, email, name, member) values ('u4', 'later@x.test', 'Later', true)");
      useClient({ query: q });
      await ensureSchema();
      expect((await q("select user_id from memberships")).length).toBe(2);
    });
  });

  describe("which workspace", () => {
    it("is the first one for callers with no person, only while it is the only one", async () => {
      expect(await workspaceId()).toBe(FOUNDING);
      await twoWorkspaces();
      await expect(workspaceId()).rejects.toBeInstanceOf(NoWorkspace);
    });

    it("is the one a scope names, and a scope must name a workspace id", async () => {
      expect(await asWorkspace(A, () => workspaceId())).toBe(A);
      expect(() => asWorkspace("../other", () => 1)).toThrow(NoWorkspace);
    });

    it("puts the workspace first in every list query, before anything the caller sent", () => {
      const { text, values } = toSql("posts", [{ method: "equal", attribute: "status", values: ["idea"] }], A);
      expect(text).toMatch(/^select \* from posts where workspace_id = \$1 and status in \(\$2\)/);
      expect(values).toEqual([A, "idea"]);
    });
  });

  describe("isolation: another workspace's rows can't be reached", () => {
    it("by listing, reading, changing or deleting, whatever id is sent", async () => {
      await twoWorkspaces();
      const mine = await asWorkspace(A, () => insertRow<{ $id: string }>("posts", { title: "Alpha's plan" }));

      await asWorkspace(B, async () => {
        expect(await listRows("posts", [])).toEqual([]);
        await expect(getRow("posts", mine.$id)).rejects.toMatchObject({ status: 404 });
        await expect(patchRow("posts", mine.$id, { title: "taken over" })).rejects.toMatchObject({ status: 404 });
        await deleteRow("posts", mine.$id); // succeeds quietly, deletes nothing
      });

      await asWorkspace(A, async () => {
        const rows = await listRows<{ $id: string; title: string }>("posts", []);
        expect(rows.map((r) => [r.$id, r.title])).toEqual([[mine.$id, "Alpha's plan"]]);
      });
    });

    it("for every workspace table", async () => {
      await twoWorkspaces();
      const rows = {
        posts: { title: "t" },
        comments: { post_id: "p", body: "b" },
        activity: { verb: "created" },
        media: { file_id: "f", name: "n.png" },
      } as const;
      for (const [table, data] of Object.entries(rows) as [keyof typeof rows, Record<string, unknown>][]) {
        const row = await asWorkspace(A, () => insertRow<{ $id: string }>(table, data));
        await asWorkspace(B, async () => {
          expect(await listRows(table, []), table).toEqual([]);
          await expect(getRow(table, row.$id), table).rejects.toMatchObject({ status: 404 });
        });
        expect((await asWorkspace(A, () => getRow<{ $id: string }>(table, row.$id))).$id).toBe(row.$id);
      }
    });

    it("can't be chosen by the caller: a workspace_id in the data is ignored, and none comes back", async () => {
      await twoWorkspaces();
      const row = await asWorkspace(A, () =>
        insertRow<Record<string, unknown>>("posts", { title: "t", workspace_id: B }),
      );
      expect(row.workspace_id).toBeUndefined();
      expect(await q("select workspace_id from posts")).toEqual([{ workspace_id: A }]);
      await asWorkspace(A, () => patchRow("posts", row.$id as string, { workspace_id: B }));
      expect(await q("select workspace_id from posts")).toEqual([{ workspace_id: A }]);
    });

    it("is refused outright with no workspace once there are two", async () => {
      await twoWorkspaces();
      await expect(listRows("posts", [])).rejects.toBeInstanceOf(NoWorkspace);
      await expect(insertRow("posts", { title: "t" })).rejects.toBeInstanceOf(NoWorkspace);
    });
  });

  describe("memberships", () => {
    const person = async (id: string, email: string) =>
      q("insert into users (id, email, name) values ($1, $2, $3)", [id, email, id]);

    it("make the first person the owner and the next a member, once each", async () => {
      await twoWorkspaces();
      await person("u1", "ana@x.test");
      await person("u2", "ben@x.test");
      await joinWorkspace("u1", A);
      await joinWorkspace("u2", A);
      await joinWorkspace("u1", A);
      expect((await workspaceMembers(A)).map((m) => [m.email, m.role])).toEqual([
        ["ana@x.test", "owner"],
        ["ben@x.test", "member"],
      ]);
      expect(await workspaceMembers(B)).toEqual([]);
    });

    it("say who is in which workspace, and leaving takes effect", async () => {
      await twoWorkspaces();
      await person("u1", "ana@x.test");
      await joinWorkspace("u1", A);
      expect(await isMember("Ana@x.test", A)).toBe(true);
      expect(await isMember("ana@x.test", B)).toBe(false);
      await leaveWorkspace("ana@x.test", A);
      expect(await isMember("ana@x.test", A)).toBe(false);
    });
  });
});
