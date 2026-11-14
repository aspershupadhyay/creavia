// What the cloud sends to Sentry (lib/sentry.ts): off without a DSN, and never a key, cookie, IP or secret link.
import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubEvent, sentryOptions, traceRate, usableDsn } from "./sentry";

const DSN = "https://abc123@o1.ingest.de.sentry.io/42";

describe("usableDsn", () => {
  it("accepts a Sentry DSN", () => {
    expect(usableDsn(DSN)).toBe(DSN);
    expect(usableDsn(`  ${DSN}\n`)).toBe(DSN);
  });

  it("turns Sentry off for anything else instead of failing", () => {
    for (const bad of [
      undefined,
      "",
      "not a url",
      "http://abc@o1.ingest.sentry.io/42",
      "https://o1.ingest.sentry.io/42",
      "https://abc@o1.ingest.sentry.io/",
    ]) {
      expect(usableDsn(bad), String(bad)).toBeUndefined();
    }
  });
});

describe("sentryOptions", () => {
  it("is off without a DSN, so a fork reports nowhere", () => {
    expect(sentryOptions(undefined)).toMatchObject({ enabled: false, dsn: undefined });
  });

  it("is on with one, sends no personal data by default, and scrubs every event", () => {
    expect(sentryOptions(DSN, "staging")).toMatchObject({
      enabled: true,
      dsn: DSN,
      environment: "staging",
      dataCollection: { userInfo: false, cookies: false, httpBodies: [], genAI: { inputs: false, outputs: false } },
    });
    expect(sentryOptions(DSN).beforeSend).toBe(scrubEvent);
  });

  it("samples every trace while developing and a tenth in production", () => {
    expect(traceRate("development")).toBe(1);
    expect(traceRate("production")).toBe(0.1);
  });
});

describe("scrubEvent", () => {
  const event = (): ErrorEvent => ({
    type: undefined,
    request: {
      url: "https://studio.example/api/u/abc?token=secret-link&view=board",
      query_string: "token=secret-link&view=board",
      cookies: { vb_session: "ticket" },
      headers: {
        Authorization: "Bearer key",
        cookie: "vb_session=ticket",
        "X-VoiceBox-Key": "vbmk_x",
        "user-agent": "Firefox",
      },
    },
    user: { id: "u1", email: "ana@example.com", ip_address: "203.0.113.9" },
  });

  it("drops keys, cookies and the IP address, and keeps what helps debugging", () => {
    const out = scrubEvent(event());
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.headers).toEqual({ "user-agent": "Firefox" });
    expect(out.user).toEqual({ id: "u1" });
  });

  it("filters secret values in the address and the query", () => {
    const out = scrubEvent(event());
    expect(out.request?.query_string).toBe("token=%5BFiltered%5D&view=board");
    expect(out.request?.url).toBe("https://studio.example/api/u/abc?token=%5BFiltered%5D&view=board");
    expect(JSON.stringify(out)).not.toContain("secret-link");
  });

  it("filters presigned storage links in breadcrumbs, absolute and relative", () => {
    const signed = "X-Amz-Credential=abc&X-Amz-Signature=deadbeef&X-Amz-Expires=3600";
    const out = scrubEvent({
      type: undefined,
      breadcrumbs: [
        { category: "fetch", data: { url: `https://bucket.r2.example/media/a.mp4?${signed}` } },
        { category: "navigation", data: { from: "/files?view=grid", to: `/files?${signed}` } },
      ],
    });
    expect(JSON.stringify(out)).not.toContain("deadbeef");
    expect(JSON.stringify(out)).not.toContain("abc");
    expect(out.breadcrumbs?.[1].data?.from).toBe("/files?view=grid");
  });

  it("leaves an event with no request alone", () => {
    expect(scrubEvent({ type: undefined, message: "boom" })).toEqual({ type: undefined, message: "boom" });
  });
});
