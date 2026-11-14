// The cloud's Worker entry: OpenNext's generated handler (.open-next/worker.js), wrapped by Sentry so every request
// gets one trace and every uncaught error is reported, with the Worker's own SENTRY_DSN. Without it, Sentry is off.
// wrangler.jsonc `main` points here (docs/adr/0003-sentry.md).
import * as Sentry from "@sentry/nextjs/cloudflare";
// @ts-expect-error .open-next/worker.js is made by `opennextjs-cloudflare build`
import handler from "./.open-next/worker.js";
import { sentryOptions } from "./lib/sentry";

type Env = { SENTRY_DSN?: string; SENTRY_ENVIRONMENT?: string };

export default Sentry.withSentry(
  (env: Env) => sentryOptions(env.SENTRY_DSN, env.SENTRY_ENVIRONMENT ?? "production"),
  handler,
);
