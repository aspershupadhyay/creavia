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

const { COOKIE, SESSION_DAYS, isAuthed, startSession, tokenOk, endSession } = await import("./session");

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
