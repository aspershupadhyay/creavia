// Next.js calls onRequestError for an error in a page, a Server Component or a route handler: it goes to the Sentry
// client that worker.ts made for this request. Kept to @sentry/cloudflare on purpose: importing @sentry/nextjs here
// compiles the whole Node SDK into every server chunk, which grew the Worker by 2.6 MB gzipped (docs/adr/0003-sentry.md).
// So `next dev` / `next start` on a laptop report nothing; production on Workers does.
import { captureException } from "@sentry/cloudflare";
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  captureException(error, {
    tags: { route: context.routePath, router: context.routerKind, route_type: context.routeType },
    // the path only: a query can carry a signed link or a code
    extra: { method: request.method, path: request.path.split("?")[0] },
  });
};
