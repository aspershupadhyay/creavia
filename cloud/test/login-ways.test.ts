// GET /api/login with no invite: the ways in a studio offers, for the desktop app's sign-in screen
// (docs/town/prd/foundation-app-connects.md). Only on/off flags that its sign-in page shows anyway; never a key.
import { afterEach, describe, expect, it, vi } from "vitest";

const ways = async (query = "") => {
  const { GET } = await import("@/app/api/login/route");
  const r = await GET(new Request(`https://studio.example/api/login${query}`));
  return { status: r.status, body: (await r.json()) as Record<string, unknown>, cache: r.headers.get("cache-control") };
};

describe("the ways in", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("says which ways are on, and nothing else", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret-value");
    vi.stubEnv("RESEND_API_KEY", "re_secret_value");
    vi.stubEnv("MAIL_FROM", "Creavia <hello@example.com>");
    vi.stubEnv("OPEN_SIGNUP", "1");
    const r = await ways();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ google: true, mail: true, open: true });
    expect(r.cache).toBe("no-store");
    expect(JSON.stringify(r.body)).not.toMatch(/secret|re_|googleusercontent/);
  });

  it("is all off on a studio with nothing set up", async () => {
    for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "MAIL_FROM", "OPEN_SIGNUP"])
      vi.stubEnv(k, "");
    expect((await ways()).body).toEqual({ google: false, mail: false, open: false });
  });

  it("an invite link still answers about the invite, not the ways", async () => {
    const r = await ways("?invite=not-a-real-invite-token");
    expect(r.status).toBe(404);
    expect(r.body).not.toHaveProperty("google");
  });
});
