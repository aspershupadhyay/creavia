// cloud/wrangler.jsonc: production and staging stay apart. Staging binds its own bucket and names that same bucket for
// presigned links (R2_BUCKET); if the two differed, staging's links would read and write production's files.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Env = { name: string; r2_buckets: { binding: string; bucket_name: string }[]; vars?: Record<string, string> };
type Config = Env & { env: { staging: Env } };

/** wrangler.jsonc without its comments (none of its strings contain "//" or "/*"). */
const config: Config = JSON.parse(
  readFileSync(path.join(__dirname, "..", "wrangler.jsonc"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,(\s*[}\]])/g, "$1"),
);

describe("wrangler.jsonc", () => {
  it("deploys production as creavia-cloud with the creavia bucket", () => {
    expect(config.name).toBe("creavia-cloud");
    expect(config.r2_buckets).toEqual([{ binding: "BUCKET", bucket_name: "creavia" }]);
  });

  it("deploys staging as its own Worker with its own bucket, named the same for links", () => {
    const staging = config.env.staging;
    expect(staging.name).toBe("creavia-cloud-staging");
    expect(staging.r2_buckets).toEqual([{ binding: "BUCKET", bucket_name: "creavia-staging" }]);
    expect(staging.vars?.R2_BUCKET).toBe("creavia-staging");
    expect(staging.vars?.SENTRY_ENVIRONMENT).toBe("staging");
  });

  it("never points either at the live VoiceBox", () => {
    expect(JSON.stringify(config)).not.toMatch(/voicebox/i);
  });
});
