// Credentials that name their workspace (docs/town/prd/foundation-workspaces-accounts.md, slice 2b). A caller with no
// signed-in person (an MCP key, a GPU's key, an upload link, a shared page) brings a key, token or link; it says which
// workspace it belongs to, and is then checked only inside that workspace (its key list, its files) or under a
// signature that covers the workspace. Changing the workspace part of a credential therefore makes it fail, never
// opens another workspace.
//
// The first workspace's credentials keep exactly the form they always had (nothing already handed out stops working);
// every other workspace's carry `<workspace>~` in front of their secret part.
import { FOUNDING, asWorkspace, isWorkspaceId, workspaceId } from "./tenant";

const BOUND = /^(w_[a-z0-9_]{6,40})~(.+)$/s;

/** A secret part as handed out in workspace w: unchanged in the first workspace, `w~secret` in any other. */
export const bindTo = (w: string, secret: string) => (w === FOUNDING ? secret : `${w}~${secret}`);

/** Which workspace a credential names, and its secret part. One without a workspace part is the first workspace's. */
export function readBound(credential: string): { workspace: string; rest: string } {
  const m = BOUND.exec(credential);
  return m && isWorkspaceId(m[1]) ? { workspace: m[1], rest: m[2] } : { workspace: FOUNDING, rest: credential };
}

/** A key with a fixed prefix (vbmk_, vbmd_, vbup_): `prefix + bindTo(w, secret)`. */
export const keyIn = (prefix: string, w: string, secret: string) => `${prefix}${bindTo(w, secret)}`;

/** The workspace a prefixed key names, or null when it isn't one of these keys. */
export function keyWorkspace(prefix: string, key: string): string | null {
  return key.startsWith(prefix) ? readBound(key.slice(prefix.length)).workspace : null;
}

/** What a signature covers for workspace w: the same text in the first workspace, `w:text` in any other. */
export const signedText = (w: string, text: string) => (w === FOUNDING ? text : `${w}:${text}`);

/** Runs fn in the workspace a credential names (fn gets the secret part). */
export function inBound<T>(credential: string, fn: (rest: string, workspace: string) => T): T {
  const { workspace, rest } = readBound(credential);
  return asWorkspace(workspace, () => fn(rest, workspace));
}

/** The workspace this code works in, for putting into a credential being made now. */
export const here = () => workspaceId();

/** A route handler run in the workspace its caller's credential names (resolve answers null when the request carries
 *  none of the credentials it knows: the handler then runs as it always did, and its own check refuses or lets in). */
export function scoped<A extends unknown[]>(
  resolve: (req: Request) => Promise<string | null> | string | null,
  handler: (req: Request, ...rest: A) => Promise<Response>,
) {
  return async (req: Request, ...rest: A) => {
    const w = await resolve(req);
    return w ? asWorkspace(w, () => handler(req, ...rest)) : handler(req, ...rest);
  };
}

const bearer = (req: Request) => (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

/** GPU workers: WORKER_SECRET is the first workspace's (it is the self-hosted studio's own secret); a cloud GPU key
 *  (vbmd_) or a workspace's worker key (vbwk_) names its workspace. lib/gpus.ts workerCaller then checks the key inside
 *  that workspace. */
export function workerWorkspace(req: Request): string | null {
  const t = bearer(req);
  if (!t) return null;
  return keyWorkspace("vbmd_", t) ?? keyWorkspace("vbwk_", t) ?? FOUNDING;
}

/** Upload keys (vbup_) name their workspace; a signed-in browser keeps its session's (null here). */
export const uploadKeyWorkspace = (req: Request): string | null => keyWorkspace("vbup_", bearer(req));

/** MCP: the master key is the first workspace's; a model key (vbmk_) names its workspace; an OAuth access token or a
 *  code-mode run key carries it as claim w (none: the first workspace). Anything else: null, and the MCP refuses it. */
export async function mcpWorkspace(req: Request): Promise<string | null> {
  const t = (
    req.headers
      .get("x-voicebox-key")
      ?.trim()
      .replace(/^bearer\s+/i, "") || bearer(req)
  ).trim();
  if (!t) return null;
  const { tokenOk } = await import("./session");
  if (tokenOk(t)) return FOUNDING;
  const model = keyWorkspace("vbmk_", t);
  if (model) return model;
  const { verify } = await import("./oauth");
  const claims = verify<{ typ: "access"; w?: unknown }>(t, "access") ?? verify<{ typ: "run"; w?: unknown }>(t, "run");
  if (!claims) return null;
  return isWorkspaceId(claims.w) ? claims.w : FOUNDING;
}

/** Signed links that carry their token in the address (/api/m/<token>/…, /u/<token>, /api/u/<token>, /s/<token>):
 *  the workspace the token at that path segment names. The route still checks the token itself, in that workspace. */
export const linkWorkspace = (segment: number) => (req: Request) => {
  const part = new URL(req.url).pathname.split("/")[segment];
  return part ? readBound(decodeURIComponent(part)).workspace : null;
};

/** Links whose token is a signed claim (lib/oauth.ts sign) at that path segment: the workspace claim w under the
 *  signature (none: the first workspace). An invalid token: null, and the route refuses it. */
export const claimWorkspace = (segment: number, typ: "upl") => async (req: Request) => {
  const part = new URL(req.url).pathname.split("/")[segment];
  if (!part) return null;
  const { verify } = await import("./oauth");
  const c = verify<{ typ: "upl"; w?: unknown }>(decodeURIComponent(part), typ);
  return c ? (isWorkspaceId(c.w) ? c.w : FOUNDING) : null;
};
