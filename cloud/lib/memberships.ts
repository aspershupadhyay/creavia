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

/** Forget cached answers (after a change here, and in tests). */
export function forget() {
  cache.clear();
}
