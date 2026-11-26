// Who is in which workspace, and as what (db/005_workspaces.sql: memberships). People are global (lib/users.ts); a
// membership puts one in a workspace as its owner or a member. lib/session.ts checks it on every request, cached for a
// minute, so someone removed from a workspace loses it within a minute, as with the studio's list before.
import { sql } from "./db";
import type { Member } from "./workspace";

export type Role = "owner" | "member";

const cache = new Map<string, { at: number; yes: boolean }>();
const MINUTE = 60_000;

/** Is the person with this email a member of this workspace? Cached a minute; a database error is a no. */
export async function isMember(email: string, workspace: string): Promise<boolean> {
  const key = `${email.toLowerCase()} ${workspace}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < MINUTE) return hit.yes;
  const rows = (await sql()
    .query("select 1 from memberships m join users u on u.id = m.user_id where u.email = $1 and m.workspace_id = $2", [
      email.toLowerCase(),
      workspace,
    ])
    .catch(() => null)) as unknown[] | null;
  if (rows === null) return hit?.yes ?? false; // the database unreachable: the last answer, else no (never fall open)
  const yes = rows.length > 0;
  cache.set(key, { at: Date.now(), yes });
  return yes;
}

/** Puts someone in a workspace: its owner if it has nobody yet, else a member. Already in it: nothing changes. */
export async function joinWorkspace(userId: string, workspace: string): Promise<void> {
  await sql().query(
    `insert into memberships (workspace_id, user_id, role)
     values ($1, $2, case when exists (select 1 from memberships where workspace_id = $1) then 'member' else 'owner' end)
     on conflict (workspace_id, user_id) do nothing`,
    [workspace, userId],
  );
  forget();
}

/** Takes someone out of a workspace. Their next request in it is refused within a minute (lib/session.ts). */
export async function leaveWorkspace(email: string, workspace: string): Promise<void> {
  await sql().query(
    "delete from memberships where workspace_id = $2 and user_id = (select id from users where email = $1)",
    [email.toLowerCase(), workspace],
  );
  forget();
}

/** The people in a workspace, owners first. */
export async function workspaceMembers(workspace: string): Promise<(Member & { role: Role })[]> {
  return (await sql().query(
    `select u.id, u.name, u.email, m.role from memberships m join users u on u.id = m.user_id
     where m.workspace_id = $1 order by m.role = 'owner' desc, m.created_at, u.id limit 200`,
    [workspace],
  )) as (Member & { role: Role })[];
}

/** This person's role in this workspace, or null when they aren't in it. */
export async function roleOf(email: string, workspace: string): Promise<Role | null> {
  const [r] = (await sql().query(
    "select m.role from memberships m join users u on u.id = m.user_id where u.email = $1 and m.workspace_id = $2",
    [email.toLowerCase(), workspace],
  )) as { role: Role }[];
  return r?.role ?? null;
}

/** Puts someone in a workspace with this role (an invite), or changes theirs when they're in it already. */
export async function addMember(userId: string, workspace: string, role: Role): Promise<void> {
  await sql().query(
    `insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)
     on conflict (workspace_id, user_id) do nothing`,
    [workspace, userId, role],
  );
  forget();
}

/** Changes someone's role. The last owner stays an owner: a workspace always has someone who can run it. */
export async function setRole(email: string, workspace: string, role: Role): Promise<void> {
  const r = (await sql().query(
    `update memberships m set role = $3 from users u
     where u.id = m.user_id and u.email = $1 and m.workspace_id = $2
       and ($3 = 'owner' or exists (select 1 from memberships o where o.workspace_id = $2 and o.role = 'owner' and o.user_id <> m.user_id))
     returning m.role`,
    [email.toLowerCase(), workspace, role],
  )) as unknown[];
  if (!r.length) {
    const now = await roleOf(email, workspace);
    if (!now) throw Object.assign(new Error("That person isn't in this workspace."), { status: 404 });
    if (now === "owner")
      throw Object.assign(new Error("A workspace needs an owner: make someone else owner first."), { status: 409 });
  }
  forget();
}

/** True when taking this person out would leave the workspace with no owner. */
export async function lastOwner(email: string, workspace: string): Promise<boolean> {
  const [r] = (await sql().query(
    `select count(*) filter (where m.role = 'owner')::int owners, bool_or(u.email = $1 and m.role = 'owner') me
     from memberships m join users u on u.id = m.user_id where m.workspace_id = $2`,
    [email.toLowerCase(), workspace],
  )) as { owners: number; me: boolean | null }[];
  return !!r?.me && r.owners <= 1;
}

export type MyWorkspace = { id: string; name: string; role: Role };
/** The workspaces this person is in, oldest first (the switcher). */
export async function myWorkspaces(userId: string): Promise<MyWorkspace[]> {
  return (await sql().query(
    `select w.id, w.name, m.role from memberships m join workspaces w on w.id = m.workspace_id
     where m.user_id = $1 order by w.created_at, w.id limit 100`,
    [userId],
  )) as MyWorkspace[];
}

/** A new, empty workspace with this person as its owner (open sign-up). Its files live under w/<id>/. */
export async function createWorkspace(name: string, ownerId: string): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  const { keyPrefix, forgetCount } = await import("./tenant");
  const id = `w_${randomBytes(10).toString("hex")}`;
  await sql().query("insert into workspaces (id, name, key_prefix) values ($1, $2, $3)", [
    id,
    name.trim().slice(0, 120) || "My studio",
    keyPrefix(id),
  ]);
  await addMember(ownerId, id, "owner");
  forgetCount(); // there is more than one workspace now: a caller with nobody named must name one (lib/tenant.ts)
  return id;
}

/** Refuses (403) unless whoever is signed in owns the workspace this request works in. An account: its role there.
 *  The master key, its sign-in and GitHub sign-ins are the self-hoster's: the first workspace's owners, nowhere else. */
export async function requireOwner(): Promise<void> {
  const [{ sessionInfo }, { workspaceId, FOUNDING }] = await Promise.all([import("./session"), import("./tenant")]);
  const [info, w] = await Promise.all([sessionInfo().catch(() => null), workspaceId()]);
  const owner = info?.how === "user" ? (await roleOf(info.who, w)) === "owner" : w === FOUNDING;
  if (!owner) throw Object.assign(new Error("Only the workspace's owners can do that."), { status: 403 });
}

/** Forget cached answers (after a change here, and in tests). */
export function forget() {
  cache.clear();
}
