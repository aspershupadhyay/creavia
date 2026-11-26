// Accounts, slice 3a, against a real Postgres (docs/town/prd/foundation-workspaces-accounts.md): sign-up lands in the
// right workspace (the studio's for its list, a new one of your own only with OPEN_SIGNUP, nowhere otherwise); an
// invite works once, for its email, in its workspace; only owners invite, remove or change roles, and a workspace keeps
// an owner; switching works only into a workspace you're in. Its own Postgres schema, like autodm-workspaces.test.ts.
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// the browser's cookies, kept in memory, so a sign-in can be followed by requests that carry it
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", () => ({ after: () => undefined }));
// the studio's list beyond its accounts (WORKSPACE_EMAILS, Settings) and its lockouts live in the bucket: none here
vi.mock("@/lib/settings", async (orig) => ({
  ...(await orig<object>()),
  getSettings: async () => ({ workspace_emails: [] }),
}));

const { useClient, ensureSchema } = await import("@/lib/db");
const { forget } = await import("@/lib/memberships");
const { FOUNDING, asWorkspace, forgetCount } = await import("@/lib/tenant");

const URL_ = process.env.TEST_DATABASE_URL;
const SPACE = "accounts_test";
const SITE = "https://studio.example";
let pool: pg.Pool;
const q = async (text: string, values?: unknown[]) => (await pool.query(text, values as unknown[])).rows;

const login = async (body: object) => {
  const { POST } = await import("@/app/api/login/route");
  const r = await POST(
    new Request(`${SITE}/api/login`, {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.1" },
      body: JSON.stringify(body),
    }),
  );
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};
const ws = async (method: "GET" | "POST" | "DELETE", path: string, body?: object) => {
  const route = await import("@/app/api/ws/[...path]/route");
  const r = await route[method](
    new Request(`${SITE}/api/ws/${path}`, {
      method,
      headers: { host: "studio.example" },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve({ path: path.split("/") }) },
  );
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};
const signUp = (email: string, extra: object = {}) =>
  login({ signup: { name: email.split("@")[0], email, password: "a-good-password" }, ...extra });
const signIn = (email: string, extra: object = {}) => login({ email, password: "a-good-password", ...extra });
const tokenOf = (link: unknown) => new URL(String(link)).searchParams.get("invite") ?? "";
const workspaceOf = async (email: string) =>
  await q(
    "select m.workspace_id, m.role from memberships m join users u on u.id = m.user_id where u.email = $1 order by m.created_at",
    [email],
  );

describe.skipIf(!URL_)("accounts (Postgres)", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL_, max: 1, options: `-c search_path=${SPACE}` });
  });
  afterAll(async () => {
    useClient(null);
    await q(`drop schema if exists ${SPACE} cascade`).catch(() => null);
    await pool?.end();
  });
  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL_POOLED", "postgres://the-test-client");
    vi.stubEnv("MCP_TOKEN", "a-test-master-key-of-32-characters!");
    await q(`drop schema if exists ${SPACE} cascade`);
    await q(`create schema ${SPACE}`);
    useClient({ query: q });
    await ensureSchema();
    jar.clear();
    forget();
    forgetCount();
    // the studio has its founder, so it's no longer "whoever comes first founds it"
    expect((await signUp("founder@example.com")).status).toBe(200);
    jar.clear();
    await (await import("@/lib/access")).allowedEmails(true);
  });

  it("without OPEN_SIGNUP, someone off the list can't sign up (self-hosted studios stay invite-only)", async () => {
    const r = await signUp("stranger@example.com");
    expect(r.status).toBe(403);
    expect(await q("select 1 from users where email = 'stranger@example.com'")).toEqual([]);
  });

  it("with OPEN_SIGNUP, someone off the list gets a workspace of their own, as its owner, and not the studio's", async () => {
    vi.stubEnv("OPEN_SIGNUP", "1");
    expect((await signUp("bo@example.com")).status).toBe(200);
    const [m] = await workspaceOf("bo@example.com");
    expect(m.workspace_id).not.toBe(FOUNDING);
    expect(m.role).toBe("owner");
    expect(await q("select member from users where email = 'bo@example.com'")).toEqual([{ member: false }]);
    // the session works there, and the studio's list never lets them into the first workspace
    const me = await ws("GET", "workspaces");
    expect(me.body.current).toBe(m.workspace_id);
    expect(await ws("POST", "switch", { workspace: FOUNDING })).toMatchObject({ status: 404 });
    // signing in again lands in their own workspace
    jar.clear();
    expect((await signIn("bo@example.com")).status).toBe(200);
    expect((await ws("GET", "workspaces")).body.current).toBe(m.workspace_id);
  });

  it("an invite works once, only for its email, and only into its workspace", async () => {
    vi.stubEnv("OPEN_SIGNUP", "1");
    await signUp("bo@example.com");
    const [bo] = await workspaceOf("bo@example.com");
    const made = await ws("POST", "invites", { email: "cy@example.com", role: "member" });
    expect(made.status).toBe(200);
    const token = tokenOf(made.body.link);
    expect(await q("select token_hash from invites")).not.toContainEqual({ token_hash: token }); // stored hashed
    jar.clear();
    // someone else holding the link gets nothing from it
    expect((await signUp("eve@example.com", { invite: token })).status).toBe(403);
    expect(await q("select 1 from users where email = 'eve@example.com'")).toEqual([]);
    // the invited email joins that workspace, as a member, and works there
    expect((await signUp("cy@example.com", { invite: token })).status).toBe(200);
    expect(await workspaceOf("cy@example.com")).toEqual([{ workspace_id: bo.workspace_id, role: "member" }]);
    expect((await ws("GET", "workspaces")).body.current).toBe(bo.workspace_id);
    // and only once
    jar.clear();
    vi.stubEnv("OPEN_SIGNUP", "");
    expect((await signIn("cy@example.com", { invite: token })).status).toBe(410);
  });

  it("an invite into the studio's first workspace puts the person on its list", async () => {
    await signIn("founder@example.com");
    const token = tokenOf((await ws("POST", "invites", { email: "dee@example.com" })).body.link);
    jar.clear();
    expect((await signUp("dee@example.com", { invite: token })).status).toBe(200);
    expect(await q("select member from users where email = 'dee@example.com'")).toEqual([{ member: true }]);
    expect((await ws("GET", "workspaces")).body.current).toBe(FOUNDING);
  });

  it("only owners invite, change roles or take invites back, and a workspace keeps an owner", async () => {
    vi.stubEnv("OPEN_SIGNUP", "1");
    await signUp("bo@example.com");
    const token = tokenOf((await ws("POST", "invites", { email: "cy@example.com" })).body.link);
    const pending = await ws("POST", "invites", { email: "fay@example.com" });
    jar.clear();
    await signUp("cy@example.com", { invite: token });
    // cy is a member: refused
    expect((await ws("POST", "invites", { email: "x@example.com" })).status).toBe(403);
    expect((await ws("POST", "role", { email: "cy@example.com", role: "owner" })).status).toBe(403);
    expect((await ws("DELETE", `invites/${pending.body.id}`)).status).toBe(403);
    expect((await ws("GET", "invites")).status).toBe(403);
    // bo, the owner, can't make themselves a member while they're the only owner, but can promote cy first
    jar.clear();
    await signIn("bo@example.com");
    expect((await ws("POST", "role", { email: "bo@example.com", role: "member" })).status).toBe(409);
    expect((await ws("POST", "role", { email: "cy@example.com", role: "owner" })).status).toBe(200);
    expect((await ws("POST", "role", { email: "bo@example.com", role: "member" })).status).toBe(200);
    expect((await ws("GET", "invites")).status).toBe(403); // bo is a member now
  });

  it("an owner's invite list and take-backs are only their workspace's", async () => {
    vi.stubEnv("OPEN_SIGNUP", "1");
    await signIn("founder@example.com");
    const studio = await ws("POST", "invites", { email: "gil@example.com" });
    jar.clear();
    await signUp("bo@example.com");
    expect((await ws("GET", "invites")).body.invites).toEqual([]);
    expect((await ws("DELETE", `invites/${studio.body.id}`)).status).toBe(404);
    expect(await q("select email from invites")).toEqual([{ email: "gil@example.com" }]);
  });

  it("the master key works in the first workspace once others exist, and owns it", async () => {
    vi.stubEnv("OPEN_SIGNUP", "1");
    await signUp("bo@example.com");
    jar.clear();
    const { startSession } = await import("@/lib/session");
    await startSession("token", "token");
    forgetCount();
    const r = await ws("POST", "invites", { email: "hal@example.com" });
    expect(r.status).toBe(200);
    expect(await q("select workspace_id from invites")).toEqual([{ workspace_id: FOUNDING }]);
    // and it can't use the switcher, which is an account's
    expect((await ws("GET", "workspaces")).status).toBe(403);
  });

  it("an expired invite does nothing", async () => {
    await signIn("founder@example.com");
    const token = tokenOf((await ws("POST", "invites", { email: "ivy@example.com" })).body.link);
    await q("update invites set expires_at = now() - interval '1 minute'");
    jar.clear();
    expect((await signUp("ivy@example.com", { invite: token })).status).toBe(410);
    expect(await asWorkspace(FOUNDING, async () => (await import("@/lib/invites")).peekInvite(token))).toBeNull();
  });
});
