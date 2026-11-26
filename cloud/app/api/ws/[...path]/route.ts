// Server half of the shared workspace: the browser reads and writes posts/comments/activity/media rows here
// (rows/<table>[/<id>], Postgres on Neon through lib/data.ts) and watches them through a sealed Neon Realtime query (live).
import { DataError, backupUrl, deleteMediaRow, finalizeMedia, getMedia, insert, listMembers, listOf, patch, remove, rowOf, type Table } from "@/lib/data";
import { storageUse } from "@/lib/r2files";
import { currentUser, isAuthed } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };
const ID = /^[A-Za-z0-9._-]{1,36}$/;
const TABLES = new Set(["posts", "comments", "activity", "media"]);
const isTable = (t: unknown): t is Table => typeof t === "string" && TABLES.has(t);
/** The browser's Query.* strings (JSON), checked again column by column in lib/db.ts. */
const queriesOf = (raw: unknown) => (Array.isArray(raw) ? raw.slice(0, 12).map((x) => (typeof x === "string" ? JSON.parse(x) : x)) : []) as object[];
const bodyOf = async (req: Request) => ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
const code = (e: unknown) => (e as { status?: number }).status;
const fail = (e: unknown) =>
  Response.json({ error: (e as Error).message }, { status: e instanceof DataError ? (e.status >= 500 ? 502 : e.status) : (code(e) ?? 0) >= 400 && (code(e) ?? 0) < 500 ? (code(e) as number) : 500 });
const team = () => import("@/lib/memberships");
const tenant = () => import("@/lib/tenant");
/** The signed-in account (switching and the workspace list are an account's): a 403 for the master key or GitHub. */
const account = async () => {
  const [me, info] = await Promise.all([currentUser(), import("@/lib/session").then((m) => m.sessionInfo())]);
  // the account the ticket itself names (the person cookie alone isn't the sign-in)
  if (!me || info?.how !== "user" || info.who !== me.email.toLowerCase())
    throw Object.assign(new Error("Sign in with your account for this."), { status: 403 });
  return me;
};

export async function GET(req: Request, ctx: Ctx) {
  await (await import("@/lib/db")).ensureSchema().catch(() => null);
  if (!(await isAuthed(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [a, b] = (await ctx.params).path;
  try {
    if (a === "me") return Response.json({ user: await currentUser(), workspace: true });
    if (a === "rows" && isTable(b)) {
      const id = (await ctx.params).path[2];
      if (id) return ID.test(id) ? Response.json(await rowOf(b, id)) : Response.json({ error: "bad id" }, { status: 400 });
      return Response.json({ rows: await listOf(b, ...queriesOf(JSON.parse(new URL(req.url).searchParams.get("q") || "[]"))) });
    }
    if (a === "members") return Response.json({ members: await listMembers() });
    // the people in this workspace with their roles, and the invites still waiting (owners only)
    if (a === "team") return Response.json({ members: await (await team()).workspaceMembers(await (await tenant()).workspaceId()) });
    if (a === "invites") { await (await team()).requireOwner(); return Response.json({ invites: await (await import("@/lib/invites")).listInvites() }); }
    // the switcher: every workspace this person is in, and which one this browser works in
    if (a === "workspaces") {
      const me = await account();
      const { ticketWorkspace } = await import("@/lib/session");
      return Response.json({ current: await ticketWorkspace(), workspaces: await (await team()).myWorkspaces(me.id) });
    }
    if (a === "usage") return Response.json(await (await import("@/lib/usage")).usage());
    if (a === "storage") { const u = await storageUse(); return Response.json({ used: u.bytes, cap: u.cap, parts: u.parts }); }
    if (a === "backup" && b && ID.test(b)) {
      const url = await backupUrl(await getMedia(b));
      return url ? Response.json({ url }) : Response.json({ error: "no R2 copy yet" }, { status: 404 });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  await (await import("@/lib/db")).ensureSchema().catch(() => null);
  if (!(await isAuthed(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [a, b] = (await ctx.params).path;
  try {
    if (a === "rows" && isTable(b)) {
      const { data, id } = await bodyOf(req);
      if (id !== undefined && !(typeof id === "string" && ID.test(id))) return Response.json({ error: "bad id" }, { status: 400 });
      return Response.json(await insert(b, (data ?? {}) as Record<string, unknown>, (id as string) || undefined));
    }
    // a live query for the board
    if (a === "live" && isTable(b)) {
      const { queries } = await bodyOf(req);
      const live = await (await import("@/lib/db")).liveQuery(b, queriesOf(queries) as never);
      return live ? Response.json(live) : Response.json({ error: "Realtime is not configured (NEON_REALTIME_URL, NEON_REALTIME_SECRET)" }, { status: 503 });
    }
    if (a === "media" && b && ID.test(b)) {
      return Response.json(await finalizeMedia(b));
    }
    // switch workspace: a new ticket naming it, only for one this person is in (checked again on every request)
    if (a === "switch") {
      const me = await account();
      const { workspace } = await bodyOf(req);
      const { isWorkspaceId } = await tenant();
      if (!isWorkspaceId(workspace) || !(await (await team()).roleOf(me.email, workspace))) return Response.json({ error: "You aren't in that workspace." }, { status: 404 });
      await (await import("@/lib/session")).startSession("user", me.email, me, workspace);
      return Response.json({ ok: true, workspace });
    }
    // invite someone (owners only): answers the link to pass on; it works once, for that email, for 7 days
    if (a === "invites") {
      await (await team()).requireOwner();
      const { email, role } = await bodyOf(req);
      const me = await currentUser();
      return Response.json(await (await import("@/lib/invites")).createInvite(String(email ?? ""), (role ?? "member") as "owner" | "member", me?.id ?? null, new URL(req.url).origin));
    }
    // change someone's role (owners only; the last owner stays one)
    if (a === "role") {
      await (await team()).requireOwner();
      const { email, role } = await bodyOf(req);
      if (role !== "owner" && role !== "member") return Response.json({ error: "The role is owner or member." }, { status: 400 });
      await (await team()).setRole(String(email ?? ""), await (await tenant()).workspaceId(), role);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  if (!(await isAuthed(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [a, b, id] = (await ctx.params).path;
  try {
    if (a === "rows" && isTable(b) && id && ID.test(id)) return Response.json(await patch(b, id, ((await bodyOf(req)).data ?? {}) as Record<string, unknown>));
    return Response.json({ error: "not found" }, { status: 404 });
  } catch (e) {
    return fail(e);
  }
}

/** Rows and files are deleted here: the browser can't reach the database or the bucket. */
export async function DELETE(req: Request, ctx: Ctx) {
  if (!(await isAuthed(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [a, b] = (await ctx.params).path;
  try {
    // a row (a media row deletes its file too: below)
    const id = (await ctx.params).path[2];
    if (a === "rows" && isTable(b) && b !== "media" && id && ID.test(id)) { await remove(b, id); return Response.json({ deleted: id }); }
    // take an invite back (owners only): its link stops working
    if (a === "invites" && b && ID.test(b)) {
      await (await team()).requireOwner();
      return (await (await import("@/lib/invites")).revokeInvite(b)) ? Response.json({ deleted: b }) : Response.json({ error: "not found" }, { status: 404 });
    }
    if (a === "media" && b && ID.test(b)) {
      const who = await currentUser().catch(() => null);
      const m = await deleteMediaRow(b, who ? { id: who.id, name: who.name } : { name: "Dashboard" });
      return Response.json({ deleted: b, name: m.name });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  } catch (e) {
    return fail(e);
  }
}
