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
// what the studio emailed (lib/mailer.ts, sent to Resend: caught here), and the link in the newest one to an address
const mail: { to: string; subject: string; text: string }[] = [];
const linkIn = (to: string, param: "verify" | "reset") => {
  const m = [...mail].reverse().find((x) => x.to === to);
  return new URL((m?.text.match(/https:\/\/\S+/) ?? [""])[0] || "https://x/").searchParams.get(param) ?? "";
};
/** Open sign-up as a person does it: the form, then the emailed link. */
const openSignUp = async (email: string) => {
  vi.stubEnv("OPEN_SIGNUP", "1");
  const r = await signUp(email);
  expect(r.body.verify).toBe(true);
  return login({ verify: linkIn(email, "verify") });
};
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
    (await import("@/lib/users")).forgetSessions();
    mail.length = 0;
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_FROM", "Creavia <hello@studio.example>");
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url !== "https://api.resend.com/emails") throw new Error(`unexpected fetch ${url}`);
      const b = JSON.parse(String(init.body)) as { to: string[]; subject: string; text: string };
      mail.push({ to: b.to[0], subject: b.subject, text: b.text });
      return Response.json({ id: "email_1" });
    });
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
    expect((await openSignUp("bo@example.com")).status).toBe(200);
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
    await openSignUp("bo@example.com");
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
    await openSignUp("bo@example.com");
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
    await signIn("founder@example.com");
    const studio = await ws("POST", "invites", { email: "gil@example.com" });
    jar.clear();
    await openSignUp("bo@example.com");
    expect((await ws("GET", "invites")).body.invites).toEqual([]);
    expect((await ws("DELETE", `invites/${studio.body.id}`)).status).toBe(404);
    expect(await q("select email from invites")).toEqual([{ email: "gil@example.com" }]);
  });

  it("the master key works in the first workspace once others exist, and owns it", async () => {
    await openSignUp("bo@example.com");
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

  describe("email (3b)", () => {
    it("open sign-up needs a sender for the email check: without one it's refused, and no account is made", async () => {
      vi.stubEnv("OPEN_SIGNUP", "1");
      vi.stubEnv("RESEND_API_KEY", "");
      expect((await signUp("bo@example.com")).status).toBe(503);
      expect(await q("select 1 from users where email = 'bo@example.com'")).toEqual([]);
    });

    it("an open sign-up can't sign in until the emailed link is opened, and a fresh link can be asked for", async () => {
      vi.stubEnv("OPEN_SIGNUP", "1");
      const r = await signUp("bo@example.com");
      expect(r.status).toBe(200);
      expect(jar.size).toBe(0); // not signed in
      const first = linkIn("bo@example.com", "verify");
      const refused = await signIn("bo@example.com");
      expect(refused.status).toBe(403);
      expect(refused.body.verify).toBe(true);
      expect((await login({ resend: { email: "bo@example.com" } })).status).toBe(200);
      const second = linkIn("bo@example.com", "verify");
      expect(second).not.toBe(first);
      expect((await login({ verify: first })).status).toBe(410); // the older link stopped working
      expect((await login({ verify: second })).status).toBe(200);
      expect((await login({ verify: second })).status).toBe(410); // once
      jar.clear();
      expect((await signIn("bo@example.com")).status).toBe(200);
    });

    it("a password reset works once, for an hour, and ends the person's older sign-ins", async () => {
      await signIn("founder@example.com");
      const before = new Map(jar);
      jar.clear();
      expect((await login({ reset: { email: "founder@example.com" } })).status).toBe(200);
      const token = linkIn("founder@example.com", "reset");
      expect(token).not.toBe("");
      await new Promise((r) => setTimeout(r, 5)); // the reset comes after that sign-in
      expect((await login({ reset: { token, password: "short" } })).status).toBe(400);
      expect((await login({ reset: { token, password: "a-brand-new-password" } })).status).toBe(200);
      expect((await login({ reset: { token, password: "another-new-password" } })).status).toBe(410);
      // the old password is gone, the new one works
      jar.clear();
      expect((await signIn("founder@example.com")).status).toBe(401);
      expect((await login({ email: "founder@example.com", password: "a-brand-new-password" })).status).toBe(200);
      // the sign-in from before the reset no longer works
      jar.clear();
      for (const [k, v] of before) jar.set(k, v);
      (await import("@/lib/users")).forgetSessions();
      expect((await ws("GET", "team")).status).toBe(401);
    });

    it("an expired reset link does nothing", async () => {
      await login({ reset: { email: "founder@example.com" } });
      const token = linkIn("founder@example.com", "reset");
      await q("update email_tokens set expires_at = now() - interval '1 minute'");
      expect((await login({ reset: { token, password: "a-brand-new-password" } })).status).toBe(410);
    });

    it("asking for a reset says the same whether or not the email has an account, and sends only to real ones", async () => {
      const a = await login({ reset: { email: "founder@example.com" } });
      const b = await login({ reset: { email: "nobody@example.com" } });
      expect(a).toEqual(b);
      expect(mail.map((m) => m.to)).toEqual(["founder@example.com"]);
    });

    it("without a sender, a reset can't be asked for (and says so)", async () => {
      vi.stubEnv("MAIL_FROM", "");
      expect((await login({ reset: { email: "founder@example.com" } })).status).toBe(503);
    });
  });

  describe("Google sign-in (3b)", () => {
    const google = (profile: { email: string; email_verified: boolean; name?: string }) =>
      vi.stubGlobal("fetch", async (url: string) => {
        if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.test" });
        if (url === "https://openidconnect.googleapis.com/v1/userinfo") return Response.json(profile);
        throw new Error(`unexpected fetch ${url}`);
      });
    const viaGoogle = async (invite = "") => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "client.apps.googleusercontent.com");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
      const start = await (await import("@/app/api/auth/google/route")).GET(
        new Request(`${SITE}/api/auth/google${invite ? `?invite=${invite}` : ""}`),
      );
      const state = new URL(String(start.headers.get("location"))).searchParams.get("state");
      const back = await (await import("@/app/api/auth/google/callback/route")).GET(
        new Request(`${SITE}/api/auth/google/callback?code=abc&state=${state}`),
      );
      return { status: back.status, text: back.status === 303 ? "" : await back.text() };
    };

    it("signs in an account with that email, where it works", async () => {
      google({ email: "Founder@Example.com", email_verified: true });
      expect((await viaGoogle()).status).toBe(303);
      expect((await ws("GET", "workspaces")).body.current).toBe(FOUNDING);
    });

    it("refuses an email Google hasn't verified, and a stranger when sign-up is closed", async () => {
      google({ email: "founder@example.com", email_verified: false });
      expect((await viaGoogle()).status).toBe(403);
      google({ email: "stranger@example.com", email_verified: true });
      expect((await viaGoogle()).status).toBe(403);
      expect(await q("select 1 from users where email = 'stranger@example.com'")).toEqual([]);
    });

    it("with open sign-up, a stranger gets a workspace of their own, no email link needed (Google vouched)", async () => {
      vi.stubEnv("OPEN_SIGNUP", "1");
      vi.stubEnv("RESEND_API_KEY", ""); // not needed when Google vouches
      google({ email: "jo@example.com", email_verified: true, name: "Jo" });
      expect((await viaGoogle()).status).toBe(303);
      const [m] = await workspaceOf("jo@example.com");
      expect(m).toMatchObject({ role: "owner" });
      expect(m.workspace_id).not.toBe(FOUNDING);
      expect(await q("select password_hash, email_verified from users where email = 'jo@example.com'")).toEqual([
        { password_hash: null, email_verified: true },
      ]);
    });

    it("takes an invite through, for the invited email only", async () => {
      await signIn("founder@example.com");
      const token = tokenOf((await ws("POST", "invites", { email: "kim@example.com" })).body.link);
      jar.clear();
      google({ email: "lee@example.com", email_verified: true });
      expect((await viaGoogle(token)).status).toBe(403);
      google({ email: "kim@example.com", email_verified: true });
      expect((await viaGoogle(token)).status).toBe(303);
      expect(await workspaceOf("kim@example.com")).toEqual([{ workspace_id: FOUNDING, role: "member" }]);
    });

    it("refuses a callback this browser didn't start", async () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "client.apps.googleusercontent.com");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
      const back = await (await import("@/app/api/auth/google/callback/route")).GET(
        new Request(`${SITE}/api/auth/google/callback?code=abc&state=forged`),
      );
      expect(back.status).toBe(400);
    });
  });
});
