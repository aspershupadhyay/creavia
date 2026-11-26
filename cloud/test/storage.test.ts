// Stored files per workspace (lib/store.ts, PRD slice 2): the same key in two workspaces is two files, lists only find a
// workspace's own, the first workspace keeps its old keys without seeing the others', and a few service keys are
// shared. Runs against an in-memory stand-in for the Worker's R2 binding (the same calls lib/store.ts makes there).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/lib/db"; // plugs the session resolver into lib/tenant.ts, as the app does
import { bucketKey, delObjs, getJson, headObj, listDirs, listObjs, presign, putJson } from "@/lib/store";
import { asWorkspace, FOUNDING, NoWorkspace, perWorkspace, setResolvers, workspaceId } from "@/lib/tenant";

/** The R2 binding's surface, kept in a Map (keys exactly as the bucket would hold them). */
function memoryBucket() {
  const objects = new Map<string, Uint8Array>();
  const meta = (key: string, v: Uint8Array) => ({
    key,
    size: v.length,
    etag: "e",
    httpEtag: '"e"',
    uploaded: new Date(),
    httpMetadata: {},
  });
  return {
    objects,
    async get(key: string) {
      const v = objects.get(key);
      return v ? { ...meta(key, v), body: new Response(v as BodyInit).body } : null;
    },
    async head(key: string) {
      const v = objects.get(key);
      return v ? meta(key, v) : null;
    },
    async put(key: string, v: Uint8Array | string) {
      objects.set(key, typeof v === "string" ? new TextEncoder().encode(v) : v);
    },
    async delete(keys: string | string[]) {
      for (const k of [keys].flat()) objects.delete(k);
    },
    async list({ prefix = "", delimiter }: { prefix?: string; delimiter?: string }) {
      const under = [...objects.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b));
      const dirs = new Set<string>();
      const files = [];
      for (const [k, v] of under) {
        const rest = k.slice(prefix.length);
        if (delimiter && rest.includes(delimiter)) dirs.add(prefix + rest.slice(0, rest.indexOf(delimiter) + 1));
        else files.push(meta(k, v));
      }
      return { objects: files, truncated: false, delimitedPrefixes: [...dirs] };
    },
  };
}

const A = "w_alpha_test",
  B = "w_bravo_test";
const CONTEXT = Symbol.for("__cloudflare-context__");
let bucket: ReturnType<typeof memoryBucket>;

beforeEach(() => {
  bucket = memoryBucket();
  (globalThis as Record<symbol, unknown>)[CONTEXT] = { env: { BUCKET: bucket } };
  vi.stubEnv("R2_ACCOUNT_ID", "acct");
  vi.stubEnv("R2_ACCESS_KEY_ID", "id");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
});
afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CONTEXT];
});

describe("stored files per workspace", () => {
  it("keep the first workspace's keys as they were, and put every other under w/<id>/", async () => {
    await asWorkspace(FOUNDING, () => putJson("workspace/files.json", { who: "founding" }));
    await asWorkspace(A, () => putJson("workspace/files.json", { who: "alpha" }));
    expect([...bucket.objects.keys()].sort()).toEqual([`w/${A}/workspace/files.json`, "workspace/files.json"]);
  });

  it("make the same key two different files in two workspaces", async () => {
    await asWorkspace(A, () => putJson("settings.json", { name: "Alpha" }));
    await asWorkspace(B, async () => {
      expect(await getJson("settings.json")).toBeNull();
      expect(await headObj("settings.json")).toBeNull();
      await putJson("settings.json", { name: "Bravo" });
    });
    expect(await asWorkspace(A, () => getJson("settings.json"))).toEqual({ name: "Alpha" });
  });

  it("list only a workspace's own files, with the keys it used", async () => {
    await asWorkspace(A, () => putJson("library/a.json", 1));
    await asWorkspace(B, () => putJson("library/b.json", 2));
    expect((await asWorkspace(A, () => listObjs("library/"))).map((o) => o.key)).toEqual(["library/a.json"]);
    expect(await asWorkspace(B, () => listDirs(""))).toEqual(["library"]);
  });

  it("never show the first workspace the others' files, even from the top of the bucket", async () => {
    await asWorkspace(FOUNDING, () => putJson("library/mine.json", 1));
    await asWorkspace(A, () => putJson("library/theirs.json", 2));
    await asWorkspace(FOUNDING, async () => {
      expect((await listObjs("")).map((o) => o.key)).toEqual(["library/mine.json"]);
      expect(await listDirs("")).toEqual(["library"]);
    });
  });

  it("refuse a key spelled like another workspace's place", async () => {
    await asWorkspace(A, () => putJson("library/secret.json", "alpha's"));
    await asWorkspace(FOUNDING, async () => {
      await expect(getJson(`w/${A}/library/secret.json`)).rejects.toMatchObject({ status: 400 });
      await expect(listObjs("w/")).rejects.toMatchObject({ status: 400 });
    });
  });

  it("delete only in the workspace asked", async () => {
    await asWorkspace(A, () => putJson("library/x.json", 1));
    await asWorkspace(B, () => putJson("library/x.json", 2));
    await asWorkspace(B, () => delObjs(["library/x.json"]));
    expect(await asWorkspace(A, () => getJson("library/x.json"))).toBe(1);
    expect(await asWorkspace(B, () => getJson("library/x.json"))).toBeNull();
  });

  it("sign links to the workspace's own copy", async () => {
    const link = await asWorkspace(A, () => presign("library/take.wav"));
    expect(new URL(link).pathname).toBe(`/creavia/w/${A}/library/take.wav`);
    expect(new URL(await asWorkspace(FOUNDING, () => presign("library/take.wav"))).pathname).toBe(
      "/creavia/library/take.wav",
    );
  });

  it("share the service's own keys (sign-in lockouts, GPU build caches) across workspaces", async () => {
    expect(await asWorkspace(A, () => bucketKey("auth/epoch.json"))).toBe("auth/epoch.json");
    expect(await asWorkspace(A, () => bucketKey("cache/compile/l4/v1/part-0000"))).toBe(
      "cache/compile/l4/v1/part-0000",
    );
    // but a workspace's thumbnails are its own
    expect(await asWorkspace(A, () => bucketKey("cache/thumbs/x.webp"))).toBe(`w/${A}/cache/thumbs/x.webp`);
  });
});

describe("caches in memory", () => {
  it("keep one value per workspace", async () => {
    const cache = perWorkspace<string>();
    await asWorkspace(A, () => cache.set("alpha's token"));
    expect(await asWorkspace(B, () => cache.get())).toBeUndefined();
    expect(await asWorkspace(A, () => cache.get())).toBe("alpha's token");
  });
});

describe("working out the session's workspace", () => {
  it("can't ask for the workspace itself: that would loop, so it is refused", async () => {
    setResolvers({ session: () => workspaceId(), workspaceCount: async () => 1 });
    await expect(workspaceId()).rejects.toBeInstanceOf(NoWorkspace);
    // (the last test here: each test file gets its own modules, so no other file sees these resolvers)
  });
});

describe("worker keys per workspace (3b)", () => {
  const worker = (t: string) =>
    new Request("https://studio.example/api/register", { headers: { authorization: `Bearer ${t}` } });

  it("the first workspace's is WORKER_SECRET; any other gets its own, named for it, made once", async () => {
    vi.stubEnv("WORKER_SECRET", "the-studio-worker-secret-of-32-chars");
    vi.stubEnv("MCP_TOKEN", "a-test-master-key-of-32-characters!");
    const { workerSecret } = await import("@/lib/gpus");
    expect(await asWorkspace(FOUNDING, () => workerSecret())).toBe("the-studio-worker-secret-of-32-chars");
    expect(await asWorkspace(B, () => workerSecret(false))).toBeNull(); // a check never makes one
    const a = await asWorkspace(A, () => workerSecret());
    expect(a?.startsWith(`vbwk_${A}~`)).toBe(true);
    expect(await asWorkspace(A, () => workerSecret())).toBe(a);
    expect(JSON.stringify([...bucket.objects.values()].map((v) => new TextDecoder().decode(v)))).not.toContain(a); // sealed
  });

  it("a GPU signs in only to its own workspace with its key", async () => {
    vi.stubEnv("WORKER_SECRET", "the-studio-worker-secret-of-32-chars");
    vi.stubEnv("MCP_TOKEN", "a-test-master-key-of-32-characters!");
    const { workerSecret, workerCaller } = await import("@/lib/gpus");
    const { workerWorkspace } = await import("@/lib/bound");
    const a = (await asWorkspace(A, () => workerSecret())) as string;
    expect(workerWorkspace(worker(a))).toBe(A);
    expect(await asWorkspace(A, () => workerCaller(worker(a)))).toBe("worker");
    expect(await asWorkspace(B, () => workerCaller(worker(a)))).toBeNull();
    expect(await asWorkspace(FOUNDING, () => workerCaller(worker(a)))).toBeNull();
    // and the studio's WORKER_SECRET opens only the first workspace
    expect(await asWorkspace(A, () => workerCaller(worker("the-studio-worker-secret-of-32-chars")))).toBeNull();
    expect(await asWorkspace(FOUNDING, () => workerCaller(worker("the-studio-worker-secret-of-32-chars")))).toBe(
      "worker",
    );
  });
});

describe("sign-in log and sign out everywhere per workspace (3b)", () => {
  it("each workspace has its own, and the first keeps its old keys", async () => {
    const acc = await import("@/lib/access");
    const req = new Request("https://studio.example/api/login", { headers: { "x-forwarded-for": "10.1.2.3" } });
    await acc.noteAttempt(req, true, "ana@example.com", "account");
    await acc.noteAttempt(req, true, "bo@example.com", "account", A);
    expect((await acc.signInLog()).map((e) => e.who)).toEqual(["ana@example.com"]);
    expect((await acc.signInLog(A)).map((e) => e.who)).toEqual(["bo@example.com"]);
    expect(await acc.signInLog(B)).toEqual([]);
    await acc.signOutEverywhere(A);
    expect(await acc.sessionEpoch(A)).toBeGreaterThan(0);
    expect(await acc.sessionEpoch(B)).toBe(0);
    expect(bucket.objects.has("auth/log.json")).toBe(true);
    expect(bucket.objects.has(`auth/ws/${A}/epoch.json`)).toBe(true);
  });
});
