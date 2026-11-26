// Callers with no signed-in person (PRD slice 2b): every key, token and link names its workspace and works only there;
// the first workspace's credentials keep the exact form they always had; scheduled work runs once in each workspace.
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindTo, keyWorkspace, mcpWorkspace, readBound, scoped, signedText, workerWorkspace } from "@/lib/bound";
import { fileSig, sigOk } from "@/lib/r2files";
import { FOUNDING, asWorkspace, workspaceId } from "@/lib/tenant";
import { forEachWorkspace, oneOrAll } from "@/lib/workspaces";

const A = "w_alpha_test",
  B = "w_bravo_test";
const MASTER = "a-test-master-key-of-32-characters!";
const KEY = "workspace/media/abc123/photo.png";

beforeEach(() => {
  vi.stubEnv("MCP_TOKEN", MASTER);
  vi.stubEnv("WORKER_SECRET", "a-test-worker-secret-of-32-chars!!");
});

describe("a credential names its workspace", () => {
  it("leaves the first workspace's credentials exactly as they were", () => {
    expect(bindTo(FOUNDING, "secret")).toBe("secret");
    expect(readBound("secret")).toEqual({ workspace: FOUNDING, rest: "secret" });
    expect(signedText(FOUNDING, "body")).toBe("body");
  });

  it("puts any other workspace in front, and reads it back", () => {
    expect(bindTo(A, "secret")).toBe(`${A}~secret`);
    expect(readBound(`${A}~secret`)).toEqual({ workspace: A, rest: "secret" });
    expect(keyWorkspace("vbmk_", `vbmk_${A}~abc`)).toBe(A);
    expect(keyWorkspace("vbmk_", "vbmk_abc")).toBe(FOUNDING);
    expect(keyWorkspace("vbmk_", "vbup_abc")).toBeNull();
  });

  it("doesn't take something that only looks like a workspace", () => {
    expect(readBound("w_x~secret").workspace).toBe(FOUNDING); // too short to be an id
    expect(readBound("../w_alpha_test~x").workspace).toBe(FOUNDING);
  });
});

describe("Files links (/api/m/<token>/<key>)", () => {
  it("are what they always were in the first workspace", () => {
    const legacy = createHmac("sha256", MASTER).update(`voicebox-file-v1:${KEY}`).digest("base64url");
    expect(fileSig(KEY)).toBe(legacy);
    expect(sigOk(KEY, legacy)).toBe(true);
  });

  it("only open their own workspace's file: swapping the workspace in the link breaks it", () => {
    const mine = fileSig(KEY, A);
    expect(mine.startsWith(`${A}~`)).toBe(true);
    expect(sigOk(KEY, mine)).toBe(true);
    expect(sigOk(KEY, mine.replace(A, B))).toBe(false);
    expect(sigOk(KEY, readBound(mine).rest)).toBe(false); // the bare signature, as the first workspace's
  });
});

describe("which workspace a caller works in", () => {
  const call = (headers: Record<string, string>) =>
    new Request("https://studio.example/api/mcp", { method: "POST", headers });

  it("MCP: the master key is the first workspace's, a model key names its own", async () => {
    expect(await mcpWorkspace(call({ authorization: `Bearer ${MASTER}` }))).toBe(FOUNDING);
    expect(await mcpWorkspace(call({ authorization: `Bearer vbmk_${A}~whatever` }))).toBe(A);
    expect(await mcpWorkspace(call({ "x-voicebox-key": `vbmk_${B}~whatever` }))).toBe(B);
  });

  it("MCP: an OAuth token carries its workspace under the signature; an unsigned one is nobody's", async () => {
    const { issueTokens } = await import("@/lib/oauth");
    expect(await mcpWorkspace(call({ authorization: `Bearer ${issueTokens("client", A).access_token}` }))).toBe(A);
    expect(await mcpWorkspace(call({ authorization: `Bearer ${issueTokens("client").access_token}` }))).toBe(FOUNDING);
    const forged = `${Buffer.from(JSON.stringify({ typ: "access", cid: "x", w: B })).toString("base64url")}.bad`;
    expect(await mcpWorkspace(call({ authorization: `Bearer ${forged}` }))).toBeNull();
    expect(await mcpWorkspace(call({}))).toBeNull();
  });

  it("GPU workers: WORKER_SECRET is the first workspace's, a cloud GPU key names its own", () => {
    const worker = (t: string) =>
      new Request("https://studio.example/api/register", { headers: { authorization: `Bearer ${t}` } });
    expect(workerWorkspace(worker("anything-else"))).toBe(FOUNDING);
    expect(workerWorkspace(worker(`vbmd_${A}~key`))).toBe(A);
  });

  it("a scoped route runs inside the workspace its caller names", async () => {
    const route = scoped(
      () => A,
      async () => Response.json({ in: await workspaceId() }),
    );
    expect(await (await route(new Request("https://studio.example/x"))).json()).toEqual({ in: A });
  });
});

describe("upload tickets", () => {
  it("only work in the workspace they were made in", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "acct");
    vi.stubEnv("R2_ACCESS_KEY_ID", "id");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    const { putUpload, startUpload } = await import("@/lib/inbox");
    const { ticket } = await asWorkspace(A, () => startUpload({ name: "a.png", type: "image/png", size: 10 }));
    expect(ticket.startsWith(`${A}~`)).toBe(true);
    const put = () => putUpload(ticket, new Request("https://studio.example/x", { method: "PUT", body: "0123456789" }));
    await expect(asWorkspace(B, put)).rejects.toThrow(/isn't valid/);
    await expect(
      asWorkspace(B, () =>
        putUpload(ticket.replace(A, B), new Request("https://x/", { method: "PUT", body: "0123456789" })),
      ),
    ).rejects.toThrow(/isn't valid/);
  });
});

describe("scheduled work", () => {
  it("runs once in each workspace, and one workspace's failure doesn't stop the others", async () => {
    const seen: string[] = [];
    const turns = await forEachWorkspace(
      async () => {
        const w = await workspaceId();
        seen.push(w);
        if (w === A) throw new Error("alpha broke");
        return w;
      },
      10_000,
      [FOUNDING, A, B],
    );
    expect(seen.sort()).toEqual([FOUNDING, A, B].sort());
    expect(turns.find((t) => t.workspace === A)?.error).toBe("alpha broke");
    expect(turns.find((t) => t.workspace === B)?.result).toBe(B);
  });

  it("answers as it always did with one workspace", async () => {
    expect(oneOrAll(await forEachWorkspace(async () => ({ idle: true }), 1_000, [FOUNDING]))).toEqual({ idle: true });
  });
});
