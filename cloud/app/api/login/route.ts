// Sign-in and sign-up for the dashboard: accounts in Postgres (lib/users.ts, scrypt hashes), and the dashboard's own
// cookie is the session (lib/session.ts). Which workspace a person lands in, and who may have a new account, is decided
// in one place, lib/signin.ts, for every way in (this form, Google, invites, email links). Here, by what's posted:
//  - signup {name, email, password} (+ invite): a new account; from open sign-up it can't be used until the emailed
//    link is opened (verify);
//  - email + password (+ invite): sign in;
//  - verify (the emailed link's token): the email is theirs, and they're signed in;
//  - resend {email}: a fresh link for an account still waiting on one;
//  - reset {email}: a password reset link by email; reset {token, password}: the new password, older sign-ins voided;
//  - token: the master key as a password (scripts and the old single-user flow).
// Built to be quick: the lockout, the list and the password are checked together, and the record of the try is written
// after the reply. Nothing here says whether an email has an account, except sign-up's "already has a seat".
import { after } from "next/server";
import { clientIp, lockedFor, noteAttempt } from "@/lib/access";
import { endSession, startSession, tokenOk } from "@/lib/session";
import type { Account } from "@/lib/users";

export const dynamic = "force-dynamic";

type Body = {
  token?: string;
  email?: string;
  password?: string;
  invite?: string;
  verify?: string;
  resend?: { email?: string };
  reset?: { email?: string; token?: string; password?: string };
  signup?: { name?: string; email?: string; password?: string };
};

const slow = () => new Promise((r) => setTimeout(r, 600)); // slow down guessing
const locked = (s: number) => Response.json({ error: `Too many tries from here. Try again in ${Math.ceil(s / 60)} min.` }, { status: 429, headers: { "Retry-After": String(s) } });
const note = (req: Request, ok: boolean, who: string, how: string) => after(() => noteAttempt(req, ok, who, how).catch(() => null));
const fail = (error: string, status: number, extra: object = {}) => Response.json({ error, ...extra }, { status });
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LINK_GONE = "That link has expired or been used. Ask for a new one.";
const SENT = "If that email has an account here, a link is on its way. It works once.";

/** Signs them in where lib/signin.ts says, or answers why not. */
async function signIn(req: Request, user: Account, invite: string | null, how: string) {
  const land = await (await import("@/lib/signin")).landAccount(user, invite);
  if ("error" in land) {
    note(req, false, user.email, `${how} (${land.status === 403 ? "refused" : "failed"})`);
    if (land.status === 403) await slow();
    return fail(land.error, land.status, land.verify ? { verify: true } : {});
  }
  const who = { id: user.id, name: user.name, email: user.email };
  await startSession("user", user.email, who, land.workspace);
  note(req, true, user.email, land.how === "account" ? how : `${how} (${land.how})`);
  return Response.json({ ok: true, user: who, workspace: true });
}

/** What an invite link invites to (the sign-in page shows it): the workspace's name, the email and the role. Only
 *  whoever holds the link's own token learns this, and a used or expired one says nothing. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("invite") ?? "";
  await (await import("@/lib/db")).ensureSchema().catch(() => null);
  const inv = await (await import("@/lib/invites")).peekInvite(token).catch(() => null);
  if (!inv) return fail("That invite has expired or been used. Ask for a new one.", 404);
  return Response.json({ workspace: inv.name, email: inv.email, role: inv.role });
}

export async function POST(req: Request) {
  await (await import("@/lib/db")).ensureSchema().catch(() => null); // a brand-new studio: its tables first
  const body = (await req.json().catch(() => ({}))) as Body;
  const invite = typeof body.invite === "string" && body.invite ? body.invite : null;
  if ((process.env.MCP_TOKEN ?? "").length < 24) return fail("MCP_TOKEN is not set on the server (24+ characters).", 500);
  const origin = new URL(req.url).origin;
  const users = () => import("@/lib/users");

  // everything below can be guessed at, so all of it waits out a lockout
  const wait = await lockedFor(clientIp(req));
  if (wait) return locked(wait);

  // sign-up: who may have an account is checked before any exists, so a refused email never gets one
  if (body.signup) {
    const site = req.headers.get("sec-fetch-site");
    if (site && !["same-origin", "none"].includes(site)) return fail("forbidden", 403);
    const email = String(body.signup.email ?? "").trim().toLowerCase(), password = String(body.signup.password ?? ""), name = String(body.signup.name ?? "").trim().slice(0, 120);
    if (!EMAIL.test(email)) return fail("Enter a valid email address.", 400);
    if (password.length < 8) return fail("Use at least 8 characters for the password.", 400);
    const s = await import("@/lib/signin");
    const may = await s.mayCreate(email, invite, false);
    if ("error" in may) {
      note(req, false, email, "sign-up (refused)");
      if (may.status === 403) await slow();
      return fail(may.error, may.status);
    }
    try {
      const open = may.kind === "open";
      // on the studio's list or invited into its workspace: on its team; open sign-up: its own workspace, email unchecked
      const user = await (await users()).createAccount(email, password, name, may.kind === "listed" || (may.kind === "invite" && may.member), !open);
      if (!open) return signIn(req, { ...user, member: may.kind === "listed", email_verified: true }, invite, "sign-up");
      await s.ownWorkspace(user);
      await s.sendVerify(user, origin).catch((e) => console.error("sign-up email", (e as Error).message));
      note(req, true, email, "sign-up (own workspace, email sent)");
      return Response.json({ ok: true, verify: true, message: `We emailed a link to ${email}. Open it to finish signing up.` });
    } catch (e) {
      const status = (e as { status?: number }).status === 409 ? 409 : 502;
      return fail(status === 409 ? (e as Error).message : "Couldn't create the account right now. Try again in a minute.", status, { exists: status === 409 });
    }
  }

  // the emailed link that checks a new account's email: it's theirs, and they're in
  if (typeof body.verify === "string") {
    const id = await (await import("@/lib/emailtokens")).redeemToken("verify", body.verify).catch(() => null);
    if (!id) { note(req, false, "verify link", "verify"); return fail(LINK_GONE, 410); }
    const u = await users();
    await u.setVerified(id);
    const user = await u.findAccount({ id });
    return user ? signIn(req, user, null, "email link") : fail(LINK_GONE, 410);
  }

  // a fresh checking link for an account still waiting on one (the same answer whatever the email)
  if (body.resend) {
    const user = await (await users()).findAccount({ email: String(body.resend.email ?? "") }).catch(() => null);
    note(req, false, String(body.resend.email ?? "").slice(0, 120), "resend link"); // counts toward the lockout
    if (user && !user.email_verified) await (await import("@/lib/signin")).sendVerify(user, origin).catch((e) => console.error("resend", (e as Error).message));
    return Response.json({ ok: true, message: SENT });
  }

  // a forgotten password: a link by email (the same answer whatever the email), then the new password
  if (body.reset) {
    const { mailerReady, sendEmail } = await import("@/lib/mailer");
    if (body.reset.token !== undefined) {
      const password = String(body.reset.password ?? "");
      if (password.length < 8) return fail("Use at least 8 characters for the password.", 400);
      const id = await (await import("@/lib/emailtokens")).redeemToken("reset", String(body.reset.token)).catch(() => null);
      if (!id) { note(req, false, "reset link", "reset"); return fail(LINK_GONE, 410); }
      const u = await users();
      await u.resetPassword(id, password);
      await u.setVerified(id); // the link came to their inbox
      const user = await u.findAccount({ id });
      return user ? signIn(req, user, null, "password reset") : fail(LINK_GONE, 410);
    }
    if (!mailerReady()) return fail("Password reset needs email set up on this studio. Ask its owner to set your password.", 503);
    const email = String(body.reset.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) return fail("Enter a valid email address.", 400);
    note(req, false, email, "reset asked"); // counts toward the lockout, so it can't be used to flood an inbox
    const user = await (await users()).findAccount({ email }).catch(() => null);
    if (user) {
      const token = await (await import("@/lib/emailtokens")).issueToken("reset", user.id);
      await sendEmail({
        to: user.email,
        subject: "Reset your Creavia password",
        text: `Open this link to choose a new password (it works once, for an hour):\n\n${origin}/login?reset=${token}\n\nIf you didn't ask, ignore this email: your password stays as it is.`,
      }).catch((e) => console.error("reset email", (e as Error).message));
    }
    return Response.json({ ok: true, message: SENT });
  }

  // email and password
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    try {
      const user = await (await users()).verify(email, String(body.password ?? ""));
      if (!user) {
        note(req, false, email, "account");
        await slow();
        return fail("Wrong email or password.", 401);
      }
      const account = await (await users()).findAccount({ id: user.id });
      return account ? signIn(req, account, invite, "account") : fail("Wrong email or password.", 401);
    } catch (e) {
      note(req, false, email, "account");
      return fail(`Couldn't sign in right now: ${(e as Error).message}`, 502);
    }
  }

  if (!tokenOk(String(body.token ?? "").trim())) {
    note(req, false, "access token", "token");
    await slow();
    return fail("wrong token", 401);
  }
  await startSession("token", "token");
  note(req, true, "access token", "token");
  return Response.json({ ok: true });
}

export async function DELETE() {
  await endSession();
  return Response.json({ ok: true });
}
