// Dashboard login. Three ways in:
//  - your account (email + password, lib/users.ts), let in only when your email is on the list (lib/access.ts);
//  - GitHub, for the logins in OWNER_GITHUB / Settings;
//  - the MCP_TOKEN as a password (scripts and the old single-user flow): signed in, but anonymous.
// The session cookie is a signed ticket: who, how, when it was issued and when it ends (14 days). It's checked on every
// request: the signature, the expiry, "sign out everywhere" (anything issued before it is void), and that the person is
// still on the list, so removing someone locks them out within a minute. Cookies hold HMACs, never the token itself.
// An account's ticket also names its workspace (w), checked against its memberships on every request (lib/tenant.ts).
import { createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { FOUNDING, isWorkspaceId } from "./tenant";
import { safeEqual } from "./worker";

export const COOKIE = "vb_session";
export const USER_COOKIE = "vb_user";
export const SESSION_DAYS = 14;

const secret = () => process.env.MCP_TOKEN ?? "";

export function tokenOk(token: string | null | undefined) {
  const t = secret();
  return t.length >= 24 && !!token && safeEqual(token, t);
}

export type Who = { id: string; name: string; email: string };
/** w: the workspace an account works in; tickets from before workspaces have none and mean the first one. */
type Ticket = { k: "user" | "github" | "token"; sub: string; iat: number; exp: number; w?: string };

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const mac = (kind: string, body: string) => createHmac("sha256", secret()).update(`${kind}:${body}`).digest("base64url");
export const KEEP = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * SESSION_DAYS };

/** Sign someone in: sets the session ticket (and, for an account, who they are and which workspace they work in). */
export async function startSession(k: Ticket["k"], sub: string, who?: Who, workspace = FOUNDING) {
  if (secret().length < 24) throw new Error("MCP_TOKEN is not set on the server (24+ characters).");
  const now = Date.now();
  const t: Ticket = { k, sub: sub.toLowerCase(), iat: now, exp: now + SESSION_DAYS * 86_400_000 };
  if (k === "user") t.w = workspace;
  const body = b64(JSON.stringify(t));
  const jar = await cookies();
  jar.set(COOKIE, `${body}.${mac("voicebox-session-v2", body)}`, KEEP);
  if (who) jar.set(USER_COOKIE, userValue(who), KEEP);
  else jar.delete(USER_COOKIE);
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(USER_COOKIE);
}

async function ticket(): Promise<Ticket | null> {
  const v = (await cookies()).get(COOKIE)?.value ?? "";
  const [body, sig] = v.split(".");
  if (!body || !sig || secret().length < 24 || !safeEqual(sig, mac("voicebox-session-v2", body))) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString()) as Ticket;
    if (!t.exp || t.exp < Date.now()) return null;
    const { allowedEmails, sessionEpoch } = await import("./access");
    // both at once: each is cached on the server, but a fresh instance fetches them
    // the studio's list gates the first workspace (tickets from before workspaces mean it); in any other workspace the
    // membership below is the gate (docs/town/prd/foundation-workspaces-accounts.md, 3a)
    const needsList = t.k === "user" && (t.w === undefined || t.w === FOUNDING);
    const [epoch, list] = await Promise.all([sessionEpoch(), needsList ? allowedEmails().catch(() => null) : ([] as string[])]);
    if (t.iat < epoch) return null; // signed out everywhere since
    if (needsList && (!list || (list.length && !list.includes(t.sub)))) return null; // removed from the list
    if (t.k === "user" && t.w !== undefined) {
      // removed from that workspace (or a ticket naming something that isn't one)
      const { isMember } = await import("./memberships");
      if (!isWorkspaceId(t.w) || !(await isMember(t.sub, t.w))) return null;
    }
    if (t.k === "github") {
      const { allowedLogins } = await import("./github");
      if (!(await allowedLogins()).map((l) => l.toLowerCase()).includes(t.sub)) return null;
    }
    return t;
  } catch {
    return null;
  }
}

/** A browser request that changes something must come from this site (a page elsewhere can't ride your cookie). */
function sameSite(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const site = req.headers.get("sec-fetch-site");
  if (site && !["same-origin", "none"].includes(site)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return true; // not a browser form/fetch (scripts send no Origin)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}

/** Cookie session (browser) or Bearer MCP_TOKEN (scripts). */
export async function isAuthed(req?: Request) {
  const bearer = req?.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer && tokenOk(bearer)) return true;
  if (req && !sameSite(req)) return false;
  return !!(await ticket());
}

/** The workspace the signed-in account works in, for lib/tenant.ts; null when no account is signed in (or outside a
 *  request, where there are no cookies). */
export async function sessionWorkspace(): Promise<string | null> {
  const t = await ticket().catch(() => null);
  // the master key's sign-in and GitHub sign-ins are the self-hoster's, so the first workspace's, however many exist
  if (t) return t.k === "user" ? (t.w ?? FOUNDING) : FOUNDING;
  // a script with the master key (Bearer MCP_TOKEN) likewise
  let bearer: string | undefined;
  try { bearer = (await headers()).get("authorization")?.replace(/^Bearer\s+/i, ""); } catch { bearer = undefined; } // outside a request
  return bearer && tokenOk(bearer) ? FOUNDING : null;
}

/** The workspace an account's ticket names, for the switcher: null for the master key and GitHub sign-ins. */
export async function ticketWorkspace(): Promise<string | null> {
  const t = await ticket().catch(() => null);
  return t?.k === "user" ? (t.w ?? FOUNDING) : null;
}

/** How the current browser is signed in, for Settings → Security. */
export async function sessionInfo() {
  const t = await ticket();
  return t ? { how: t.k, who: t.k === "token" ? "access token" : t.sub, since: t.iat, until: t.exp } : null;
}

export function userValue(w: Who) {
  const body = b64(JSON.stringify(w));
  return `${body}.${mac("voicebox-user-v1", body)}`;
}

/** The signed-in person, or null for a token / GitHub login. */
export async function currentUser(): Promise<Who | null> {
  const v = (await cookies()).get(USER_COOKIE)?.value ?? "";
  const [body, sig] = v.split(".");
  if (!body || !sig || !secret() || !safeEqual(sig, mac("voicebox-user-v1", body))) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()) as Who; } catch { return null; }
}
