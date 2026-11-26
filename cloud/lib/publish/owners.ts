// Which workspace each connected Instagram account belongs to (db/006_autodm_workspaces.sql account_owners). Instagram's
// webhook has nobody signed in and names only the account, so this is how its delivery finds its workspace
// (lib/publish/autodm.ts onWebhook). An account belongs to one workspace at a time: connecting it in a second one is
// refused until the first disconnects it, so a comment can never be answered by two workspaces' automations.
import { FOUNDING, asWorkspace, workspaceId } from "../tenant";

export type OwnedNetwork = "instagram";

// per server instance, for a short while: deliveries come in bursts, and an account that moves workspace (or nobody's
// account, looked for everywhere once) is seen correctly on every instance within TTL
const TTL = 2 * 60_000;
const known = new Map<string, { w: string | null; at: number }>();
const cached = (k: string) => {
  const c = known.get(k);
  return c && Date.now() - c.at < TTL ? c : null;
};
const remember = (k: string, w: string | null) => known.set(k, { w, at: Date.now() });

const db = async () => {
  const m = await import("../db");
  if (!m.hasDb()) return null;
  await (await import("./dmstore")).ensure(); // makes account_owners when it isn't there yet
  return m.sql();
};
const ownerRow = async (q: Awaited<ReturnType<typeof db>>, network: OwnedNetwork, account: string) => {
  const rows = (await q?.query("select workspace_id from account_owners where network = $1 and account = $2", [
    network,
    account,
  ])) as { workspace_id: string }[] | undefined;
  return rows?.[0]?.workspace_id ?? null;
};

/** This workspace takes the account on connecting it. Another workspace holding it already: refused, plainly. */
export async function claimAccount(network: OwnedNetwork, account: string) {
  const q = await db();
  if (!q) return;
  const w = await workspaceId();
  const k = `${network}:${account}`;
  if (cached(k)?.w === w) return; // already this workspace's (a token refresh saves the account again)
  const [row] = (await q.query(
    `insert into account_owners (network, account, workspace_id) values ($1, $2, $3)
     on conflict (network, account) do update set network = excluded.network returning workspace_id`,
    [network, account, w],
  )) as { workspace_id: string }[];
  if (row && row.workspace_id !== w)
    throw Object.assign(
      new Error("That Instagram account is connected in another workspace. Disconnect it there first."),
      { status: 409 },
    );
  remember(k, w);
}

/** The account was disconnected here: it's free for any workspace again. */
export async function releaseAccount(network: OwnedNetwork, account: string) {
  const q = await db();
  if (!q) return;
  await q.query("delete from account_owners where network = $1 and account = $2 and workspace_id = $3", [
    network,
    account,
    await workspaceId(),
  ]);
  known.delete(`${network}:${account}`);
}

/** The workspace that connected this account, or null when none did. An account connected before accounts had owners
 *  is found where its connection is stored, and claimed for that workspace from then on. */
export async function ownerOf(network: OwnedNetwork, account: string): Promise<string | null> {
  if (!account) return null;
  const k = `${network}:${account}`;
  const hit = cached(k);
  if (hit) return hit.w;
  const q = await db();
  if (!q) return FOUNDING; // no database: there is only the studio there always was
  let w = await ownerRow(q, network, account);
  if (!w) {
    const { workspaceIds } = await import("../workspaces");
    const { getAccount } = await import("./accounts");
    for (const ws of await workspaceIds()) {
      const found = await asWorkspace(ws, () => getAccount(account)).catch(() => null);
      if (found?.network !== network) continue;
      await asWorkspace(ws, () => claimAccount(network, account)).catch(() => null);
      w = await ownerRow(q, network, account);
      break;
    }
  }
  remember(k, w);
  return w;
}
