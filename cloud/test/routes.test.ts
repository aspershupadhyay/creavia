// The signed-out sweep: every route in cloud/app is called, by every method it serves, by a stranger (no cookie, no
// key) and by someone with a made-up key. Each call must be refused (a 4xx, a 503 "not set up", or a redirect to the
// sign-in page) without the route reaching storage, a database or any other service; only the methods route-guards.ts
// marks `open`, with a reason, may answer. A route missing from route-guards.ts fails here, so every new route is
// looked at. This is the first part of the workspace-isolation suite (docs/ENGINEERING.md §3).
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { type Method, ROUTES } from "./route-guards";

// Signed out: an empty cookie jar and plain headers. `after` (work after the reply) is dropped so nothing runs late.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", async (load) => ({ ...(await load<object>()), after: () => {} }));

const APP = path.resolve(import.meta.dirname, "../app");
const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const SITE = "https://studio.example";

function routeFiles(dir = APP): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [path.relative(APP, full).split(path.sep).join("/")] : [];
  });
}

/** Route params for any dynamic segment: a short made-up value, or two for a catch-all. */
const anyParams = new Proxy({} as Record<string, unknown>, {
  get: (_target, key) =>
    key === "then" ? undefined : ["path", "key", "rest"].includes(String(key)) ? ["x", "y"] : "x",
});

type Handler = (req: Request, ctx: { params: Promise<Record<string, unknown>> }) => Promise<Response>;
type Caller = { who: string; headers: Record<string, string> };

const CALLERS: Caller[] = [
  { who: "a stranger", headers: {} },
  { who: "someone with a made-up key", headers: { authorization: `Bearer ${"f".repeat(40)}` } },
];

/** A refusal: the caller learns nothing and changes nothing. 500 is not one: a crash may have done half the work. */
function isRefusal(res: Response) {
  if (res.status >= 400 && res.status < 500) return true;
  if (res.status === 503) return true; // the feature isn't set up on this server
  if (res.status >= 300 && res.status < 400)
    return new URL(res.headers.get("location") ?? "", SITE).pathname === "/login";
  return false;
}

describe("route-guards.ts lists every route", () => {
  const onDisk = routeFiles().sort();

  it("has an entry for every route.ts in cloud/app", () => {
    expect(onDisk.filter((f) => !(f in ROUTES))).toEqual([]);
  });

  it("has no entry for a route that no longer exists", () => {
    expect(Object.keys(ROUTES).filter((f) => !onDisk.includes(f))).toEqual([]);
  });
});

describe.each(Object.entries(ROUTES))("%s", (file, { guard, open = {} }) => {
  it.each(CALLERS)(`refuses $who (guard: ${guard})`, async ({ headers }) => {
    // the servers' secrets exist, so every check runs for real rather than failing early because nothing is set up
    vi.stubEnv("MCP_TOKEN", "m".repeat(32));
    vi.stubEnv("WORKER_SECRET", "w".repeat(32));
    const network = vi.fn((input: unknown) => {
      throw new Error(`reached the network: ${String(input)}`);
    });
    vi.stubGlobal("fetch", network);

    const mod = (await import(path.join(APP, file))) as Partial<Record<Method, Handler>>;
    const served = METHODS.filter((m) => typeof mod[m] === "function");
    expect(served.length, "a route serves at least one method").toBeGreaterThan(0);

    for (const method of served) {
      const req = new Request(`${SITE}/api/sweep`, {
        method,
        headers: { host: "studio.example", "content-type": "application/json", ...headers },
        body: method === "GET" ? undefined : "{}",
      });
      const res = await (mod[method] as Handler)(req, { params: Promise.resolve(anyParams) });
      const label = `${method} ${file} answered ${res.status}`;
      if (open[method]) expect(res.status, label).toBeLessThan(500);
      else expect(isRefusal(res), label).toBe(true);
    }
    expect(network, `${file} reached the network for a signed-out caller`).not.toHaveBeenCalled();
  });
});
