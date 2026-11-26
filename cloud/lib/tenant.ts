// Which workspace this code is working in: the one place that decides it (docs/town/prd/foundation-workspaces-accounts.md).
// lib/db.ts asks here before every query and scopes it to the answer, so a request can only ever read and write its own
// workspace's rows. In order:
//  1. an explicit scope (asWorkspace): background work, cron and tests say which workspace they are for;
//  2. the signed-in person's session, which names its workspace (lib/session.ts checks they are still a member);
//  3. callers with no person (the master key, GitHub sign-in, MCP keys, webhooks): the first workspace, but only while
//     it is the only one. Once a second exists this throws, so nothing can fall into the wrong workspace; slice 2 gives
//     each of those callers an explicit workspace before slice 3 lets anyone create one.
// With no answer it throws: never a default.
import { AsyncLocalStorage } from "node:async_hooks";

/** The studio that existed before workspaces (db/005_workspaces.sql). */
export const FOUNDING = "w_founding";

/** A workspace id as stored: w_ and 6–40 letters, digits or _ (the session and scopes are checked against it). */
export const isWorkspaceId = (id: unknown): id is string => typeof id === "string" && /^w_[a-z0-9_]{6,40}$/.test(id);

export class NoWorkspace extends Error {
  status = 403;
  constructor(why: string) {
    super(`No workspace: ${why}`);
  }
}

const scope = new AsyncLocalStorage<string>();
/** Set while the session's workspace is being worked out: anything that asks for the workspace then is a loop. */
const resolving = new AsyncLocalStorage<true>();

/** Runs fn inside one workspace: every query it makes, however deep, is scoped to it. */
export function asWorkspace<T>(id: string, fn: () => T): T {
  if (!isWorkspaceId(id)) throw new NoWorkspace(`"${id}" is not a workspace id`);
  return scope.run(id, fn);
}

type Resolvers = { session: () => Promise<string | null>; workspaceCount: () => Promise<number> };
let resolvers: Resolvers | null = null;
/** lib/session.ts and lib/db.ts plug in here (a direct import would be circular). */
export function setResolvers(r: Resolvers) {
  resolvers = r;
}

let count: { at: number; n: number } | null = null;
/** How many workspaces exist, cached for a minute (only the fallback for callers with no person needs it). */
async function workspaceCount() {
  if (count && Date.now() - count.at < 60_000) return count.n;
  count = { at: Date.now(), n: await (await plugged()).workspaceCount() };
  return count.n;
}
/** The resolvers, loading lib/db.ts (which plugs them in) when nothing has yet: code that only stores files never
 *  imports it itself. */
async function plugged(): Promise<Resolvers> {
  if (!resolvers) await import("./db");
  if (!resolvers) throw new NoWorkspace("the database layer didn't load");
  return resolvers;
}
/** Tests: forget the cached count. */
export const forgetCount = () => {
  count = null;
};

/** The workspace this code works in. Throws NoWorkspace rather than guess. */
export async function workspaceId(): Promise<string> {
  const pinned = scope.getStore();
  if (pinned) return pinned;
  const r = await plugged();
  // checking a session reads the sign-in list, which must name its own workspace (lib/access.ts) rather than ask here
  if (resolving.getStore()) throw new NoWorkspace("asked for the workspace while working out the session's own");
  const session = r.session;
  const fromSession = await resolving.run(true, () => session());
  if (fromSession) return fromSession;
  if ((await workspaceCount()) <= 1) return FOUNDING;
  throw new NoWorkspace("this request has no person, and the studio has more than one workspace");
}

/** Where a workspace's files live in the bucket: the first workspace keeps the keys it always had; every other one is
 *  under w/<id>/ (lib/store.ts adds it, so callers never see it). */
export const keyPrefix = (workspace: string) => (workspace === FOUNDING ? "" : `w/${workspace}/`);

/** A value kept in memory per workspace. A module-level cache of workspace data must be one of these, or the first
 *  workspace to fill it would hand its data to the next. */
export function perWorkspace<T>() {
  const values = new Map<string, T>();
  return {
    get: async (): Promise<T | undefined> => values.get(await workspaceId()),
    set: async (value: T | undefined) => {
      const w = await workspaceId();
      if (value === undefined) values.delete(w);
      else values.set(w, value);
    },
  };
}

/** Things that run on the studio's own accounts (Kaggle's KAGGLE_USERNAME, the GitHub repository GPU deploys run in):
 *  the first workspace's only, since another workspace would spend the studio's hours. Elsewhere it says so plainly. */
export async function onlyFirstWorkspace(what: string) {
  if ((await workspaceId()) !== FOUNDING)
    throw Object.assign(
      new Error(
        `${what} run on the studio's own account, so only in its first workspace. Use Colab with your own Google account, or a cloud GPU (Modal or Cerebrium) with its own key.`,
      ),
      { status: 403 },
    );
}
