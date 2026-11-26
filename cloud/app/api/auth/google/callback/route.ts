// Google sign-in callback: Google vouches for the email; lib/signin.ts decides whether it may have an account and where
// it lands, as for a password. Only this browser's own state cookie is accepted, so a link from elsewhere can't sign it in.
import { cookies } from "next/headers";
import { noteAttempt } from "@/lib/access";
import { GOOGLE_STATE, googleEnabled, googleProfile } from "@/lib/google";
import { origin } from "@/lib/oauth";
import { startSession } from "@/lib/session";
import { safeEqual } from "@/lib/worker";

export const dynamic = "force-dynamic";

const deny = (msg: string, status = 403) =>
  new Response(`${msg}\n\nGo back to /login and try again.`, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

export async function GET(req: Request) {
  if (!googleEnabled()) return deny("Google sign-in isn't configured", 404);
  const q = new URL(req.url).searchParams;
  const jar = await cookies();
  const [state, inviteRaw] = (jar.get(GOOGLE_STATE)?.value ?? "").split(".");
  jar.delete({ name: GOOGLE_STATE, path: "/api/auth/google" });
  if (!state || !safeEqual(state, q.get("state") ?? ""))
    return deny("Sign-in expired or was started in another browser.", 400);
  if (q.get("error")) return deny(`Google said: ${q.get("error")}`, 400);
  const invite = inviteRaw || null;

  await (await import("@/lib/db")).ensureSchema().catch(() => null);
  let p: Awaited<ReturnType<typeof googleProfile>>;
  try {
    p = await googleProfile(q.get("code") ?? "", `${origin(req)}/api/auth/google/callback`);
  } catch (e) {
    return deny((e as Error).message, 502);
  }
  if (!p.verified) return deny("Google hasn't verified that email address, so it can't be used to sign in.");

  const u = await import("@/lib/users");
  const s = await import("@/lib/signin");
  let user = await u.findAccount({ email: p.email });
  if (!user) {
    const may = await s.mayCreate(p.email, invite, true);
    if ("error" in may) {
      await noteAttempt(req, false, p.email, "google (refused)");
      return deny(may.error, may.status);
    }
    const made = await u.createAccount(
      p.email,
      null,
      p.name,
      may.kind === "listed" || (may.kind === "invite" && may.member),
      true,
    );
    if (may.kind === "open") await s.ownWorkspace(made);
    user = { ...made, member: may.kind === "listed", email_verified: true };
  } else if (!user.email_verified) {
    await u.setVerified(user.id); // Google has vouched for it
    user = { ...user, email_verified: true };
  }
  const land = await s.landAccount(user, invite);
  if ("error" in land) {
    await noteAttempt(req, false, p.email, "google");
    return deny(land.error, land.status);
  }
  await startSession("user", user.email, { id: user.id, name: user.name, email: user.email }, land.workspace);
  await noteAttempt(req, true, user.email, "google", land.workspace);
  return Response.redirect(new URL("/", origin(req)), 303);
}
