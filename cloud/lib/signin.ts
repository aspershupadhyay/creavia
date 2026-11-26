// Where a person lands when they sign in, whichever way they came (password, Google, an invite or an email link), and
// whether a new account may be made at all. One place, so every way in follows the same rules
// (docs/town/prd/foundation-workspaces-accounts.md, 3a and 3b):
//  - an invite: the workspace it invites to, for the invited email only;
//  - on the studio's list (lib/access.ts): the first workspace;
//  - otherwise: the oldest other workspace they belong to; none, and they're refused.
// A new account off the list and with no invite needs OPEN_SIGNUP=1 and, unless Google has vouched for the email, a
// sender for the email that checks it (lib/mailer.ts): open sign-up never runs without that check.
import { FOUNDING } from "./tenant";
import type { Account } from "./users";

export type Landing = { workspace: string; how: string } | { error: string; status: number; verify?: boolean };
const refuse = (error: string, status: number, verify?: boolean): Landing => ({
  error,
  status,
  ...(verify ? { verify } : {}),
});

export const openSignup = () => process.env.OPEN_SIGNUP === "1";

/** The workspace this account works in now, joining an invite's or the studio's on the way. */
export async function landAccount(user: Account, invite?: string | null): Promise<Landing> {
  if (invite) {
    const w = await (await import("./invites"))
      .acceptInvite(invite, user)
      .catch((e) => e as Error & { status?: number });
    return typeof w === "string" ? { workspace: w, how: "invite" } : refuse(w.message, w.status ?? 502);
  }
  if (!user.email_verified)
    return refuse(
      "Open the link we emailed you to finish signing up. Ask for a new one below if it's gone.",
      403,
      true,
    );
  const { allowedEmails } = await import("./access");
  const list = await allowedEmails(true);
  if (list.length === 0 || list.includes(user.email)) {
    // on the studio's list (or the very first sign-in, which founds the studio): its team, its first workspace
    const [{ setMember }, { joinWorkspace }] = await Promise.all([import("./users"), import("./memberships")]);
    await Promise.all([user.member ? null : setMember(user.email, true), joinWorkspace(user.id, FOUNDING)]);
    return { workspace: FOUNDING, how: list.length ? "account" : "account (founded the studio)" };
  }
  const mine = (await (await import("./memberships")).myWorkspaces(user.id)).filter((x) => x.id !== FOUNDING);
  if (mine.length) return { workspace: mine[0].id, how: "account" };
  return refuse(`${user.email} isn't on this studio's list. Ask the owner to add you in Settings → Security.`, 403);
}

export type NewAccount = { kind: "invite"; workspace: string; member: boolean } | { kind: "listed" } | { kind: "open" };
/** May this email have a new account, and what kind? `vouched`: Google has said the email is theirs. */
export async function mayCreate(
  email: string,
  invite: string | null,
  vouched: boolean,
): Promise<NewAccount | { error: string; status: number }> {
  if (invite) {
    const inv = await (await import("./invites")).peekInvite(invite).catch(() => null);
    if (!inv) return { error: "That invite has expired or been used. Ask for a new one.", status: 410 };
    if (inv.email !== email) return { error: `That invite is for ${inv.email}. Use that email.`, status: 403 };
    return { kind: "invite", workspace: inv.workspace_id, member: inv.workspace_id === FOUNDING };
  }
  const { emailAllowed } = await import("./access");
  if (await emailAllowed(email).catch(() => false)) return { kind: "listed" };
  if (!openSignup())
    return {
      error:
        "We couldn't create a seat for that email. Ask the owner to add it in Settings → Security, then try again.",
      status: 403,
    };
  if (!vouched && !(await import("./mailer")).mailerReady())
    return { error: "Sign-up needs email set up on this studio first. Ask its owner.", status: 503 };
  return { kind: "open" };
}

/** After making an open sign-up's account: its own workspace, owned by it. */
export async function ownWorkspace(user: { id: string; name: string }) {
  return (await import("./memberships")).createWorkspace(user.name ? `${user.name}'s studio` : "My studio", user.id);
}

/** Emails the link that checks a new account's email (a day, once). */
export async function sendVerify(user: { id: string; email: string }, origin: string) {
  const token = await (await import("./emailtokens")).issueToken("verify", user.id);
  await (await import("./mailer")).sendEmail({
    to: user.email,
    subject: "Finish signing up to Creavia",
    text: `Open this link to finish signing up (it works once, for a day):\n\n${origin.replace(/\/$/, "")}/login?verify=${token}\n\nIf you didn't sign up, ignore this email.`,
  });
}
