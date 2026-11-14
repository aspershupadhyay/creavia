// Sentry in the browser: errors, traces and logs, and a replay only of sessions that hit an error, with every word
// and image masked (the owner's choice, 2026-11-14). The DSN is set when the cloud is built (NEXT_PUBLIC_SENTRY_DSN);
// without it, nothing is sent.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry";

const base = sentryOptions(
  process.env.NEXT_PUBLIC_SENTRY_DSN,
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
);

Sentry.init({
  ...base,
  integrations: base.enabled
    ? [Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })]
    : [],
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
});

// traces page changes in the browser
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
