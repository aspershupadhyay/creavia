// The sign-in ticket (lib/session.ts): who gets in, and every way a ticket must stop working. These are the rules the
// whole cloud's security rests on (CLAUDE.md: never loosen the allow-list, the same-origin check or the expiry), so
// each one has a test that fails if it is loosened.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The cookie jar Next gives a request, kept in memory so a test can sign in and then make requests with that cookie.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

// Who is on the list and when "sign out everywhere" was last pressed: normally read from storage.
const access = { epoch: 0, emails: [] as string[] | Error };
vi.mock("./access", () => ({
  sessionEpoch: async () => access.epoch,
  allowedEmails: async () => {
    if (access.emails instanceof Error) throw access.emails;
    return access.emails;
  },
}));
const github = { logins: [] as string[] };
vi.mock("./github", () => ({ allowedLogins: async () => github.logins }));

// Who is in which workspace ("email workspace"): normally the memberships table (lib/memberships.ts).
const members = new Set<string>();
vi.mock("./memberships", () => ({ isMember: async (email: string, w: string) => members.has(`${email} ${w}`) }));

const { COOKIE, SESSION_DAYS, isAuthed, sessionWorkspace, startSession, tokenOk, endSession } = await import(
  "./session"
);

const TOKEN = "a-test-master-key-of-32-characters!";
const SITE = "https://studio.example";

/** A request to the studio, as a browser on the same site would send it unless `headers` say otherwise. */
function request(method = "GET", headers: Record<string, string> = {}) {
  return new Request(`${SITE}/api/dash/posts`, { method, headers: { host: "studio.example", ...headers } });
}

beforeEach(() => {
  jar.clear();
  access.epoch = 0;
  access.emails = ["ana@example.com"];
  github.logins = [];
  members.clear();
  members.add("ana@example.com w_founding");
  vi.stubEnv("MCP_TOKEN", TOKEN);
});
afterEach(() => vi.useRealTimers());

describe("tokenOk: the master key", () => {
  it("accepts exactly the server's key", () => {
    expect(tokenOk(TOKEN)).toBe(true);
    expect(tokenOk(`${TOKEN}x`)).toBe(false);
    expect(tokenOk(TOKEN.slice(1))).toBe(false);
  });

  it("refuses an empty or missing key", () => {
    expect(tokenOk("")).toBe(false);
    expect(tokenOk(null)).toBe(false);
    expect(tokenOk(undefined)).toBe(false);
  });

  it("refuses everything while the server's key is shorter than 24 characters, even a matching one", () => {
    vi.stubEnv("MCP_TOKEN", "short-key");
    expect(tokenOk("short-key")).toBe(false);
    vi.stubEnv("MCP_TOKEN", "");
    expect(tokenOk("")).toBe(false);
  });
});

describe("isAuthed: scripts with the key", () => {
  it("lets in a Bearer key with no cookie", async () => {
    expect(await isAuthed(request("POST", { authorization: `Bearer ${TOKEN}` }))).toBe(true);
  });

  it("refuses a wrong Bearer key", async () => {
    expect(await isAuthed(request("POST", { authorization: "Bearer not-the-key-at-all-not-the-key" }))).toBe(false);
  });

  it("refuses a request with neither key nor cookie", async () => {
    expect(await isAuthed(request())).toBe(false);
  });
});

describe("isAuthed: the session ticket", () => {
  it("lets in someone on the list who signed in", async () => {
    await startSession("user", "Ana@Example.com", { id: "u1", name: "Ana", email: "ana@example.com" });
    expect(await isAuthed(request())).toBe(true);
  });

  it("refuses a ticket whose signature was changed", async () => {
    await startSession("user", "ana@example.com");
    const [body, sig] = (jar.get(COOKIE) ?? "").split(".");
    jar.set(COOKIE, `${body}.${sig.slice(0, -2)}xx`);
    expect(await isAuthed(request())).toBe(false);
  });

  it("refuses a ticket whose body was swapped for someone else's", async () => {
    await startSession("user", "ana@example.com");
    const sig = (jar.get(COOKIE) ?? "").split(".")[1];
    const forged = Buffer.from(
      JSON.stringify({ k: "token", sub: "x", iat: Date.now(), exp: Date.now() + 1e9 }),
    ).toString("base64url");
    jar.set(COOKIE, `${forged}.${sig}`);
    expect(await isAuthed(request())).toBe(false);
  });

  it("refuses a ticket made under another master key (changing the key signs everyone out)", async () => {
    await startSession("user", "ana@example.com");
    vi.stubEnv("MCP_TOKEN", "a-different-master-key-32-chars!!");
    expect(await isAuthed(request())).toBe(false);
  });

  it(`stops working after ${SESSION_DAYS} days`, async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    await startSession("user", "ana@example.com");
    vi.setSystemTime(new Date(Date.now() + SESSION_DAYS * 86_400_000 - 1000));
    expect(await isAuthed(request())).toBe(true);
    vi.setSystemTime(new Date(Date.now() + 2000));
    expect(await isAuthed(request())).toBe(false);
  });

  it("stops working after 'sign out everywhere'", async () => {
    await startSession("user", "ana@example.com");
    access.epoch = Date.now() + 1;
    expect(await isAuthed(request())).toBe(false);
  });

  it("stops working when the person is taken off the list", async () => {
    await startSession("user", "ana@example.com");
    access.emails = ["someone-else@example.com"];
    expect(await isAuthed(request())).toBe(false);
  });

  it("fails closed when the list can't be read", async () => {
    await startSession("user", "ana@example.com");
    access.emails = new Error("storage is down");
    expect(await isAuthed(request())).toBe(false);
  });

  it("lets a GitHub login in only while it is allowed", async () => {
    github.logins = ["Octo-Cat"];
    await startSession("github", "octo-cat");
    expect(await isAuthed(request())).toBe(true);
    github.logins = [];
    expect(await isAuthed(request())).toBe(false);
  });

  it("is gone after signing out", async () => {
    await startSession("user", "ana@example.com");
    await endSession();
    expect(await isAuthed(request())).toBe(false);
  });

  it("refuses to start a session while the master key is too short", async () => {
    vi.stubEnv("MCP_TOKEN", "short");
    await expect(startSession("user", "ana@example.com")).rejects.toThrow(/MCP_TOKEN/);
  });
});

describe("the session's workspace", () => {
  it("is the one the account signed in to, while they are a member of it", async () => {
    members.add("ana@example.com w_secondone");
    await startSession("user", "ana@example.com", undefined, "w_secondone");
    expect(await isAuthed(request())).toBe(true);
    expect(await sessionWorkspace()).toBe("w_secondone");
  });

  it("stops working when the person is taken out of that workspace", async () => {
    await startSession("user", "ana@example.com");
    expect(await isAuthed(request())).toBe(true);
    members.delete("ana@example.com w_founding");
    expect(await isAuthed(request())).toBe(false);
    expect(await sessionWorkspace()).toBeNull();
  });

  it("can't be a workspace the person was never in", async () => {
    await startSession("user", "ana@example.com", undefined, "w_someoneelse");
    expect(await isAuthed(request())).toBe(false);
  });

  it("means the first workspace for a ticket from before workspaces", async () => {
    const now = Date.now();
    const body = Buffer.from(
      JSON.stringify({ k: "user", sub: "ana@example.com", iat: now, exp: now + 86_400_000 }),
    ).toString("base64url");
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", TOKEN).update(`voicebox-session-v2:${body}`).digest("base64url");
    jar.set(COOKIE, `${body}.${sig}`);
    expect(await sessionWorkspace()).toBe("w_founding");
  });

  it("is the first workspace for the master key and GitHub sign-ins (the self-hoster's), however many exist", async () => {
    await startSession("token", "token");
    expect(await sessionWorkspace()).toBe("w_founding");
    github.logins = ["octo"];
    await startSession("github", "octo");
    expect(await sessionWorkspace()).toBe("w_founding");
  });

  it("is none with nobody signed in", async () => {
    expect(await sessionWorkspace()).toBeNull();
  });
});

describe("who may be in which workspace (3a)", () => {
  it("in another workspace, membership is the gate: an account off the studio's list still works there", async () => {
    members.add("bo@example.com w_bosstudio");
    await startSession("user", "bo@example.com", undefined, "w_bosstudio");
    expect(await isAuthed(request())).toBe(true);
    expect(await sessionWorkspace()).toBe("w_bosstudio");
  });

  it("the studio's list still gates the first workspace, membership or not", async () => {
    members.add("bo@example.com w_founding");
    await startSession("user", "bo@example.com");
    expect(await isAuthed(request())).toBe(false); // not on the list
  });

  it("taken out of their own workspace, they're out within the check", async () => {
    members.add("bo@example.com w_bosstudio");
    await startSession("user", "bo@example.com", undefined, "w_bosstudio");
    members.delete("bo@example.com w_bosstudio");
    expect(await isAuthed(request())).toBe(false);
  });
});

describe("isAuthed: a change must come from this site", () => {
  beforeEach(async () => {
    await startSession("user", "ana@example.com");
  });

  it("lets a same-site change through", async () => {
    expect(await isAuthed(request("POST", { origin: SITE, "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("refuses a change sent from another site, even with a good cookie", async () => {
    expect(await isAuthed(request("POST", { "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(await isAuthed(request("DELETE", { "sec-fetch-site": "same-site" }))).toBe(false);
  });

  it("refuses a change whose Origin is another host", async () => {
    expect(await isAuthed(request("POST", { origin: "https://evil.example" }))).toBe(false);
    expect(await isAuthed(request("PUT", { origin: "https://studio.example.evil.example" }))).toBe(false);
  });

  it("refuses a change with an Origin that isn't an address", async () => {
    expect(await isAuthed(request("POST", { origin: "null" }))).toBe(false);
  });

  it("still allows reads from anywhere the cookie goes (GET changes nothing)", async () => {
    expect(await isAuthed(request("GET", { "sec-fetch-site": "cross-site" }))).toBe(true);
  });
});
