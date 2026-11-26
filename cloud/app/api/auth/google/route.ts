// Starts Google sign-in: the state cookie ties the callback to this browser and keeps an invite link's token, if the
// sign-in came from one (lib/google.ts).
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { GOOGLE_STATE, googleAuthUrl, googleEnabled } from "@/lib/google";
import { origin } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!googleEnabled()) return new Response("Google sign-in isn't configured", { status: 404 });
  const state = randomBytes(24).toString("base64url");
  const invite = (new URL(req.url).searchParams.get("invite") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  (await cookies()).set(GOOGLE_STATE, `${state}.${invite}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return Response.redirect(googleAuthUrl(state, `${origin(req)}/api/auth/google/callback`), 302);
}
