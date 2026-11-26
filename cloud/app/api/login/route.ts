// Sign-in and sign-up for the dashboard: accounts in Postgres (lib/users.ts, scrypt hashes), and the dashboard's own
// cookie is the session (lib/session.ts). Where it lands (docs/town/prd/foundation-workspaces-accounts.md, 3a):
//  - an email on the studio's list (lib/access.ts): the first workspace, as always;
//  - an invite link (lib/invites.ts): the workspace it invites to, for the invited email only;
//  - anyone else signing up, only when OPEN_SIGNUP=1 (the hosted service): a new workspace of their own, as its owner;
//  - anyone else signing in: the oldest other workspace they belong to; none, and they're refused as before.
// Built to be quick: the lockout, the list and the password are checked together, and the record of the try is written
// after the reply.
import { after } from "next/server";
import { allowedEmails, clientIp, emailAllowed, lockedFor, noteAttempt } from "@/lib/access";
import { endSession, startSession, tokenOk } from "@/lib/session";
import { FOUNDING } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const slow = () => new Promise((r) => setTimeout(r, 600)); // slow down guessing
const locked = (s: number) => Response.json({ error: `Too many tries from here. Try again in ${Math.ceil(s / 60)} min.` }, { status: 429, headers: { "Retry-After": String(s) } });
const note = (req: Request, ok: boolean, who: string, how: string) => after(() => noteAttempt(req, ok, who, how).catch(() => null));

const NO_SEAT = "We couldn't create a seat for that email. Ask the owner to add it in Settings → Security, then try again.";
const openSignup = () => process.env.OPEN_SIGNUP === "1";
const refused = (e: unknown) => {
  const status = (e as { status?: number }).status;
  return Response.json({ error: (e as Error).message }, { status: status && status >= 400 && status < 500 ? status : 502 });
};

/** What an invite link invites to (the sign-in page shows it): the workspace's name, the email and the role. Only
 *  whoever holds the link's own token learns this, and a used or expired one says nothing. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("invite") ?? "";
  await (await import("@/lib/db")).ensureSchema().catch(() => null);
  const inv = await (await import("@/lib/invites")).peekInvite(token).catch(() => null);
  if (!inv) return Response.json({ error: "That invite has expired or been used. Ask for a new one." }, { status: 404 });
  return Response.json({ workspace: inv.name, email: inv.email, role: inv.role });
}

export async function POST(req: Request) {
  await (await import("@/lib/db")).ensureSchema().catch(() => null); // a brand-new studio: its tables first
  const { token, signup, email: loginEmail, password: loginPassword, invite: inviteToken } = (await req.json().catch(() => ({}))) as { token?: string; email?: string; password?: string; invite?: string; signup?: { name?: string; email?: string; password?: string } };
  const invite = typeof inviteToken === "string" && inviteToken ? inviteToken : null;
  if ((process.env.MCP_TOKEN ?? "").length < 24) return Response.json({ error: "MCP_TOKEN is not set on the server (24+ characters)." }, { status: 500 });

  // sign-up: the list is checked before any account exists, so an uninvited email never gets one
  if (signup) {
    const wait = await lockedFor(clientIp(req));
    if (wait) return locked(wait);
    const site = req.headers.get("sec-fetch-site");
    if (site && !["same-origin", "none"].includes(site)) return Response.json({ error: "forbidden" }, { status: 403 });
    const email = String(signup.email ?? "").trim().toLowerCase(), password = String(signup.password ?? ""), name = String(signup.name ?? "").trim().slice(0, 120);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 8) return Response.json({ error: "Use at least 8 characters for the password." }, { status: 400 });
    // an invite decides on its own (its email must be this one); else the list; else open sign-up, when it's on
    const inv = invite ? await (await import("@/lib/invites")).peekInvite(invite).catch(() => null) : null;
    if (invite && !inv) return Response.json({ error: "That invite has expired or been used. Ask for a new one." }, { status: 410 });
    if (inv && inv.email !== email) return Response.json({ error: `That invite is for ${inv.email}. Sign up with that email.` }, { status: 403 });
    const listed = inv ? false : await emailAllowed(email).catch(() => false);
    if (!inv && !listed && !openSignup()) {
      note(req, false, email, "sign-up (not on the list)");
      await slow();
      return Response.json({ error: NO_SEAT }, { status: 403 });
    }
    try {
      const { createAccount } = await import("@/lib/users");
      const m = await import("@/lib/memberships");
      // on the studio's list (or invited into its workspace): on its team; a workspace of one's own: not
      const user = await createAccount(email, password, name, inv ? inv.workspace_id === FOUNDING : !!listed);
      let w = FOUNDING, how = "sign-up";
      if (inv) { w = await (await import("@/lib/invites")).acceptInvite(invite as string, user); how = "sign-up (invite)"; }
      else if (listed) await m.joinWorkspace(user.id, FOUNDING);
      else { w = await m.createWorkspace(name ? `${name}'s studio` : "My studio", user.id); how = "sign-up (own workspace)"; }
      await startSession("user", user.email, user, w);
      note(req, true, user.email, how);
      return Response.json({ ok: true, user, workspace: true });
    } catch (e) {
      if ((e as { status?: number }).status === 410 || (e as { status?: number }).status === 403) return refused(e);
      const status = (e as { status?: number }).status === 409 ? 409 : 502;
      return Response.json({ error: status === 409 ? (e as Error).message : "Couldn't create the account right now. Try again in a minute.", exists: status === 409 }, { status });
    }
  }

  // email and password
  if (loginEmail !== undefined) {
    const email = String(loginEmail).trim().toLowerCase();
    try {
      const { setMember, verify } = await import("@/lib/users");
      const [wait, user, list] = await Promise.all([lockedFor(clientIp(req)), verify(email, String(loginPassword ?? "")), allowedEmails(true)]);
      if (wait) return locked(wait);
      if (!user) {
        note(req, false, email, "account");
        await slow();
        return Response.json({ error: "Wrong email or password." }, { status: 401 });
      }
      const who = { id: user.id, name: user.name, email: user.email };
      if (invite) {
        // an invite link: join its workspace and work there (it checks the email is the invited one)
        const w = await (await import("@/lib/invites")).acceptInvite(invite, user).catch((e) => e as Error);
        if (w instanceof Error) { note(req, false, user.email, "account (invite)"); return refused(w); }
        await startSession("user", user.email, who, w);
        note(req, true, user.email, "account (invite)");
        return Response.json({ ok: true, user: who, workspace: true });
      }
      const ok = list.length ? list.includes(user.email) : "founder";
      if (!ok) {
        // not on the studio's list: the oldest other workspace they belong to (one of their own, or invited into)
        const mine = (await (await import("@/lib/memberships")).myWorkspaces(user.id)).filter((x) => x.id !== FOUNDING);
        if (mine.length) {
          await startSession("user", user.email, who, mine[0].id);
          note(req, true, user.email, "account");
          return Response.json({ ok: true, user: who, workspace: true });
        }
        note(req, false, user.email, "account (not on the list)");
        await slow();
        return Response.json({ error: `${user.email} isn't on this studio's list. Ask the owner to add you in Settings → Security.` }, { status: 403 });
      }
      // on the list, so in the studio's workspace (joining first: the session is checked against it)
      await Promise.all([user.member ? null : setMember(user.email, true), (await import("@/lib/memberships")).joinWorkspace(user.id, FOUNDING)]);
      await startSession("user", user.email, { id: user.id, name: user.name, email: user.email }, FOUNDING);
      note(req, true, user.email, ok === "founder" ? "account (founded the studio)" : "account");
      return Response.json({ ok: true, user: { id: user.id, name: user.name, email: user.email }, workspace: true });
    } catch (e) {
      note(req, false, email, "account");
      return Response.json({ error: `Couldn't sign in right now: ${(e as Error).message}` }, { status: 502 });
    }
  }

  const wait = await lockedFor(clientIp(req));
  if (wait) return locked(wait);
  if (!tokenOk(String(token ?? "").trim())) {
    note(req, false, "access token", "token");
    await slow();
    return Response.json({ error: "wrong token" }, { status: 401 });
  }
  await startSession("token", "token");
  note(req, true, "access token", "token");
  return Response.json({ ok: true });
}

export async function DELETE() {
  await endSession();
  return Response.json({ ok: true });
}
