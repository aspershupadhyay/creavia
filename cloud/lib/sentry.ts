// Sentry settings for the cloud, shared by the Worker entry (worker.ts) and the browser (instrumentation-client.ts).
// One place decides what is sent, so the two can't drift apart. (No Node set-up: `next dev` / `next start` report
// nothing, to keep the Worker small; instrumentation.ts says why.) Without a DSN Sentry is off: a fork or a self-hosted studio reports nowhere until its owner sets
// their own (docs/adr/0003-sentry.md).
import type { ErrorEvent } from "@sentry/nextjs";

/** Headers that carry a key, a session or a person's identity. Never sent, whatever the SDK's defaults become. */
const PRIVATE_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-voicebox-key",
  "x-creavia-key",
  "x-forwarded-for",
  "cf-connecting-ip",
];

/** Query keys whose values are secrets: links signed for one person, OAuth codes, presigned R2/B2 links (X-Amz-*). */
const PRIVATE_QUERY =
  /^(token|ticket|code|state|sig|signature|key|access_token|refresh_token|id_token|password|x-amz-[a-z-]+|sentry_key)$/i;

/** A DSN this SDK can use: `https://<key>@<host>/<project id>`. Anything else turns Sentry off rather than failing. */
export function usableDsn(dsn: string | undefined): string | undefined {
  if (!dsn) return undefined;
  try {
    const u = new URL(dsn.trim());
    return u.protocol === "https:" && u.username && /^\/\d+$/.test(u.pathname) ? dsn.trim() : undefined;
  } catch {
    return undefined; // not a URL: Sentry stays off, and nothing breaks
  }
}

/** Every trace while developing (to see one when checking); a tenth in production, where volume costs quota. */
export const traceRate = (environment: string) => (environment === "production" ? 0.1 : 1);

/** Removes what must never leave the studio: keys, cookies, IP addresses, secret query values. */
export function scrubEvent<E extends ErrorEvent>(event: E): E {
  const req = event.request;
  if (req) {
    delete req.cookies;
    if (req.headers) {
      for (const name of Object.keys(req.headers)) {
        if (PRIVATE_HEADERS.includes(name.toLowerCase())) delete req.headers[name];
      }
    }
    if (typeof req.query_string === "string") req.query_string = scrubQuery(req.query_string);
    if (req.url) req.url = scrubUrl(req.url);
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  // breadcrumbs: page addresses and fetched URLs before the error can carry signed links
  for (const crumb of event.breadcrumbs ?? []) {
    const data = crumb.data;
    if (!data) continue;
    for (const key of ["url", "to", "from"]) {
      if (typeof data[key] === "string") data[key] = scrubUrl(data[key]);
    }
  }
  return event;
}

function scrubQuery(query: string) {
  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) if (PRIVATE_QUERY.test(key)) params.set(key, "[Filtered]");
  return params.toString();
}

function scrubUrl(url: string) {
  try {
    const u = new URL(url, "https://relative.invalid");
    if (u.host === "relative.invalid") return `${u.pathname}${u.search ? `?${scrubQuery(u.search)}` : ""}`;
    u.search = scrubQuery(u.search);
    return u.toString();
  } catch {
    return url; // a relative or odd URL: leave it; it carries no query we could read anyway
  }
}

/** The options every cloud Sentry client starts from. */
export function sentryOptions(dsn: string | undefined, environment = "production") {
  const usable = usableDsn(dsn);
  return {
    dsn: usable,
    enabled: !!usable,
    environment,
    tracesSampleRate: traceRate(environment),
    // What a creator makes (scripts, captions, DMs, prompts and model answers) and who they are stays out of Sentry:
    // errors say where it broke, not what someone wrote. Logs are on by default in this SDK version.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubEvent,
  };
}
