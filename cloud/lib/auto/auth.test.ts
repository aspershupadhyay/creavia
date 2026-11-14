// The MCP's key wrapper (lib/auto/auth.ts withKeyHeader): a refused key must come back as a 401 that says what
// arrived (prefix and length only), never as a crash, and never with the key itself.
import { describe, expect, it } from "vitest";
import { withKeyHeader } from "./auth";

const refuse = async () => new Response("unauthorized", { status: 401 });
const accept = async () => new Response("ok", { status: 200 });
const call = (headers: Record<string, string>) =>
  new Request("https://studio.example/api/mcp", { method: "POST", headers });

describe("withKeyHeader", () => {
  it("answers a wrong key with a 401 naming what arrived, not a crash", async () => {
    const res = await withKeyHeader(refuse)(call({ authorization: "Bearer vbmk_wrongwrongwrong" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("x-voicebox-auth-seen")).toBe("vbmk_... (20 chars)");
    expect(res.headers.get("x-voicebox-key-seen")).toBe("none");
  });

  it("never echoes more than the first five characters of a key", async () => {
    const key = "vbmk_supersecretpart";
    const res = await withKeyHeader(refuse)(call({ "x-voicebox-key": key }));
    expect(res.headers.get("x-voicebox-key-seen")).toBe(`vbmk_... (${key.length} chars)`);
    expect([...res.headers.values()].join(" ")).not.toContain("supersecret");
  });

  it("survives a key with characters a header can't carry", async () => {
    const res = await withKeyHeader(refuse)(call({ "x-voicebox-key": "kéyÿ-abc" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("x-voicebox-key-seen")).toBe("k?y?-... (8 chars)");
  });

  it("leaves an accepted call untouched", async () => {
    const res = await withKeyHeader(accept)(call({ authorization: "Bearer good" }));
    expect(res.status).toBe(200);
    expect(res.headers.has("x-voicebox-auth-seen")).toBe(false);
  });
});
