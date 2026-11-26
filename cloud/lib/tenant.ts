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
  if (!resolvers) throw new NoWorkspace("the database is not set up");
  count = { at: Date.now(), n: await resolvers.workspaceCount() };
  return count.n;
}
/** Tests: forget the cached count. */
export const forgetCount = () => {
  count = null;
};

/** The workspace this code works in. Throws NoWorkspace rather than guess. */
export async function workspaceId(): Promise<string> {
  const pinned = scope.getStore();
  if (pinned) return pinned;
  if (!resolvers) throw new NoWorkspace("the database is not set up");
  const fromSession = await resolvers.session();
  if (fromSession) return fromSession;
  if ((await workspaceCount()) <= 1) return FOUNDING;
  throw new NoWorkspace("this request has no person, and the studio has more than one workspace");
}
