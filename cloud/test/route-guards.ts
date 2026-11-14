// Every route the cloud serves, with what guards it. test/routes.test.ts calls each one signed out and checks it
// refuses without touching storage; a route that isn't listed here fails that test, so a new route can't ship without
// someone deciding (and writing down) who may call it. When workspaces land (Phase 0), the same sweep will call every
// route with another workspace's ids.
//
// Paths are relative to cloud/app. `open` lists the methods that answer a signed-out caller on purpose, with the reason.

export type Guard =
  /** A signed-in person (cookie) or the master key (Bearer MCP_TOKEN): lib/session.ts isAuthed. */
  | "session"
  /** A GPU worker: WORKER_SECRET or the cloud GPU's key (lib/gpus.ts workerCaller). */
  | "worker"
  /** The scheduled jobs: lib/cronauth.ts cronAuthed. */
  | "cron"
  /** A GitHub Actions OIDC token from this repository's workflow on main (lib/cronauth.ts githubOidc). */
  | "github-oidc"
  /** The MCP server: an OAuth access token or the master key (verifyMcp). */
  | "mcp"
  /** A link whose path carries an HMAC made by this server, so only someone it was given to can use it. */
  | "signed-link"
  /** Instagram's webhook: a signature over the body under the app secret. */
  | "webhook-signature"
  /** Part of signing in (OAuth, GitHub, the login form): reachable signed out by design. */
  | "sign-in";

export type RouteGuard = { guard: Guard; open?: Partial<Record<Method, string>> };
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const ROUTES: Record<string, RouteGuard> = {
  ".well-known/oauth-authorization-server/[[...rest]]/route.ts": {
    guard: "sign-in",
    open: { GET: "OAuth server metadata (RFC 8414): public by the standard, holds no secrets" },
  },
  ".well-known/oauth-protected-resource/[[...rest]]/route.ts": {
    guard: "sign-in",
    open: { GET: "OAuth resource metadata (RFC 9728): public by the standard, holds no secrets" },
  },
  "api/auth/github/route.ts": { guard: "sign-in" },
  "api/auth/github/callback/route.ts": { guard: "sign-in" },
  "api/bundle/route.ts": { guard: "worker" },
  "api/cron/backup/route.ts": { guard: "cron" },
  "api/cron/live/route.ts": { guard: "cron" },
  "api/cron/publish/route.ts": { guard: "cron" },
  "api/cron/sweep/route.ts": { guard: "cron" },
  "api/dash/[...path]/route.ts": { guard: "session" },
  "api/downloads/done/route.ts": { guard: "worker" },
  "api/file/[job]/[file]/route.ts": { guard: "session" },
  "api/files/carousels/route.ts": { guard: "session" },
  "api/files/complete/route.ts": { guard: "session" },
  "api/files/put/[ticket]/route.ts": { guard: "signed-link" },
  "api/files/upload/route.ts": { guard: "session" },
  "api/gpus/deploy-keys/route.ts": { guard: "github-oidc" },
  "api/gpus/deploy-report/route.ts": { guard: "github-oidc" },
  "api/ig/webhook/route.ts": { guard: "webhook-signature" },
  "api/kaggle/boot/route.ts": { guard: "signed-link" },
  "api/login/route.ts": {
    guard: "sign-in",
    open: { DELETE: "signing out: only clears this browser's own cookies" },
  },
  "api/m/[sig]/[...key]/route.ts": { guard: "signed-link" },
  "api/mcp/route.ts": { guard: "mcp" },
  "api/mcp/lean/route.ts": { guard: "mcp" },
  "api/modal/app/route.ts": { guard: "worker" },
  "api/oauth/authorize/route.ts": { guard: "sign-in" },
  "api/oauth/register/route.ts": { guard: "sign-in" },
  "api/oauth/token/route.ts": { guard: "sign-in" },
  "api/publish/[network]/[step]/route.ts": { guard: "session" },
  "api/register/route.ts": { guard: "worker" },
  "api/u/[token]/route.ts": { guard: "signed-link" },
  "api/upload/route.ts": { guard: "session" },
  "api/upload/put/route.ts": { guard: "session" },
  "api/worker-cache/route.ts": { guard: "worker" },
  "api/worker-env/route.ts": { guard: "worker" },
  "api/ws/[...path]/route.ts": { guard: "session" },
  "api/zip/[job]/route.ts": { guard: "session" },
  "l/[token]/route.ts": { guard: "signed-link" },
};
