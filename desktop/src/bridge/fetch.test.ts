// Which requests the bridge sends through Rust, and which stay in the web view.
// The Windows start-up crash of 0.1.1 ("Out of Memory") came from routing http://ipc.localhost through Rust, which
// called ipc.localhost again, forever. These tests keep that, and the rest of the routing rules, from regressing.
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  // the app's own origin: http://tauri.localhost on Windows (tauri://localhost elsewhere)
  (globalThis as { location?: unknown }).location = new URL("http://tauri.localhost/home");
});

const load = async () => (await import("./fetch")).routed;

describe("routed", () => {
  it("sends the studio's paths to the cloud", async () => {
    const routed = await load();
    expect(routed("/api/posts?x=1")).toBe("/api/posts?x=1");
    expect(routed("/u/abc")).toBe("/u/abc");
    expect(routed("http://tauri.localhost/api/files")).toBe("/api/files");
  });

  it("keeps the app's own files in the web view", async () => {
    const routed = await load();
    expect(routed("/assets/index.js")).toBeNull();
    expect(routed("http://tauri.localhost/icons/a.png")).toBeNull();
  });

  it("never routes Tauri's own *.localhost channels (the Windows crash of 0.1.1)", async () => {
    const routed = await load();
    expect(routed("http://ipc.localhost/plugin%3Aupdater%7Ccheck")).toBeNull();
    expect(routed("http://cloud.localhost/api/file/a.mp3")).toBeNull();
    expect(routed("https://ipc.localhost/http")).toBeNull();
  });

  it("sends other websites through Rust", async () => {
    const routed = await load();
    expect(routed("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(routed("http://localhost:7377/mcp")).toBe("http://localhost:7377/mcp");
  });

  it("ignores what isn't a web address", async () => {
    const routed = await load();
    expect(routed("data:image/png;base64,AAAA")).toBeNull();
    expect(routed("blob:http://tauri.localhost/1")).toBeNull();
  });
});
