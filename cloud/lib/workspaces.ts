// Work that runs for every workspace with nobody signed in: the scheduled knocks (app/api/cron/*). Each workspace's
// turn runs inside that workspace (lib/tenant.ts asWorkspace), so its jobs read and write only its own rows and files,
// and one workspace's failure never stops the others' turns (docs/town/prd/foundation-workspaces-accounts.md, 2b).
import { FOUNDING, asWorkspace } from "./tenant";

/** Every workspace, oldest first. Without a database there is only the studio there always was. */
export async function workspaceIds(): Promise<string[]> {
  const { hasDb, sql } = await import("./db");
  if (!hasDb()) return [FOUNDING];
  const rows = (await sql().query("select id from workspaces order by created_at, id")) as { id: string }[];
  return rows.length ? rows.map((r) => r.id) : [FOUNDING];
}

export type Turn<T> = { workspace: string; result?: T; error?: string };

/** Runs fn once in each workspace, one after another, until `ms` is used up; fn gets the time left for its turn. The
 *  starting workspace moves each minute, so when there isn't time for all, each still gets regular turns. */
export async function forEachWorkspace<T>(
  fn: (msLeft: number) => Promise<T>,
  ms: number,
  ids?: string[],
): Promise<Turn<T>[]> {
  const until = Date.now() + ms;
  const all = ids ?? (await workspaceIds());
  const start = Math.floor(Date.now() / 60_000) % all.length;
  const order = [...all.slice(start), ...all.slice(0, start)];
  const out: Turn<T>[] = [];
  for (const [i, w] of order.entries()) {
    const left = until - Date.now();
    if (left <= 0) break;
    // an even share of what's left, so one busy workspace can't take every turn's time
    const share = Math.max(1_000, Math.floor(left / (order.length - i)));
    try {
      out.push({ workspace: w, result: await asWorkspace(w, () => fn(share)) });
    } catch (e) {
      out.push({ workspace: w, error: (e as Error).message });
    }
  }
  return out;
}

/** A knock's answer: one workspace's result as it always was; several workspaces' side by side. */
export function oneOrAll<T>(turns: Turn<T>[]): T | { error: string } | { workspaces: Turn<T>[] } | null {
  if (turns.length === 1) return turns[0].error ? { error: turns[0].error } : (turns[0].result ?? null);
  return { workspaces: turns };
}
