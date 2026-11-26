// Invites into a workspace (db/005_workspaces.sql invites; docs/town/prd/foundation-workspaces-accounts.md, slice 3a).
// An owner invites an email as owner or member. The link carries a random token that is stored only as its hash, works
// once, for 7 days, and only for the email it was made for: a forwarded link signs nobody else in. Accepting puts the
// person in that workspace; an invite into the first workspace also puts them on the studio's sign-in list.
import { createHash, randomBytes } from "node:crypto";
import { sql } from "./db";
import type { Role } from "./memberships";
import { FOUNDING, workspaceId } from "./tenant";

const DAYS = 7;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const hash = (token: string) => createHash("sha256").update(`creavia-invite-v1:${token}`).digest("hex");
const refuse = (message: string, status = 400) => Object.assign(new Error(message), { status });

export type Invite = {
  id: string;
  email: string;
  role: Role;
  created_at: string;
  expires_at: string;
  invited_by: string | null;
};

/** A new invite into this workspace. A waiting invite for the same email is replaced, so only the newest link works.
 *  Answers the link to pass on (no email is sent yet). */
export async function createInvite(email: string, role: Role, by: string | null, origin: string) {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw refuse("Enter a valid email address.");
  if (role !== "owner" && role !== "member") throw refuse("The role is owner or member.");
  const w = await workspaceId();
  const already = (await sql().query(
    "select 1 from memberships m join users u on u.id = m.user_id where u.email = $1 and m.workspace_id = $2",
    [email, w],
  )) as unknown[];
  if (already.length) throw refuse("That person is in this workspace already.", 409);
  const token = randomBytes(32).toString("base64url");
  const { newId } = await import("./db");
  const id = newId();
  await sql().query("delete from invites where workspace_id = $1 and email = $2 and accepted_at is null", [w, email]);
  const [row] = (await sql().query(
    `insert into invites (id, workspace_id, email, role, token_hash, invited_by, expires_at)
     values ($1, $2, $3, $4, $5, $6, now() + make_interval(days => $7::int)) returning expires_at`,
    [id, w, email, role, hash(token), by, DAYS],
  )) as { expires_at: string }[];
  return { id, email, role, expires_at: row.expires_at, link: `${origin.replace(/\/$/, "")}/login?invite=${token}` };
}

/** This workspace's invites still waiting, newest first. */
export async function listInvites(): Promise<Invite[]> {
  return (await sql().query(
    `select id, email, role, created_at, expires_at, invited_by from invites
     where workspace_id = $1 and accepted_at is null and expires_at > now() order by created_at desc limit 200`,
    [await workspaceId()],
  )) as Invite[];
}

/** Take an invite back: its link stops working. Only this workspace's. */
export async function revokeInvite(id: string) {
  const r = (await sql().query(
    "delete from invites where id = $1 and workspace_id = $2 and accepted_at is null returning id",
    [id, await workspaceId()],
  )) as unknown[];
  return r.length > 0;
}

type Waiting = { id: string; workspace_id: string; email: string; role: Role; name: string };
/** What a link invites to, while it still works: for the sign-in page (which workspace, for which email). */
export async function peekInvite(token: string): Promise<Waiting | null> {
  if (!TOKEN.test(token)) return null;
  const [r] = (await sql().query(
    `select i.id, i.workspace_id, i.email, i.role, w.name from invites i join workspaces w on w.id = i.workspace_id
     where i.token_hash = $1 and i.accepted_at is null and i.expires_at > now()`,
    [hash(token)],
  )) as Waiting[];
  return r ?? null;
}

/** Use the invite: the signed-in person (by email) joins its workspace. Once only, for the invited email only.
 *  Answers the workspace they joined. */
export async function acceptInvite(token: string, user: { id: string; email: string }): Promise<string> {
  const inv = await peekInvite(token);
  if (!inv) throw refuse("That invite has expired or been used. Ask for a new one.", 410);
  if (inv.email !== user.email.toLowerCase())
    throw refuse(`That invite is for ${inv.email}. Sign in with that email.`, 403);
  // claimed in one statement, so two tabs using the same link can't both join
  const used = (await sql().query(
    "update invites set accepted_at = now() where id = $1 and accepted_at is null and expires_at > now() returning id",
    [inv.id],
  )) as unknown[];
  if (!used.length) throw refuse("That invite has expired or been used. Ask for a new one.", 410);
  const { addMember } = await import("./memberships");
  await addMember(user.id, inv.workspace_id, inv.role);
  if (inv.workspace_id === FOUNDING) {
    // the first workspace is also gated by the studio's list (lib/access.ts): an owner's invite puts them on it
    await (await import("./users")).setMember(user.email, true);
    await (await import("./access")).allowedEmails(true).catch(() => null);
  }
  return inv.workspace_id;
}
