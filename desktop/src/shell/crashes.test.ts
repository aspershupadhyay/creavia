// What the web view passes to Rust when it hits an error (shell/crashes.ts).
import { describe, expect, it } from "vitest";
import { describeError } from "./crashes";

describe("describeError", () => {
  it("keeps the message and stack and drops the query and hash from the page", () => {
    const err = new Error("boom");
    const out = describeError(err, "/local/models?token=secret#take");
    expect(out.message).toBe("boom");
    expect(out.stack).toContain("boom");
    expect(out.page).toBe("/local/models");
  });

  it("turns anything thrown into something reportable", () => {
    expect(describeError("plain text", "/").message).toBe("plain text");
    expect(describeError({ weird: true }, "/").message).toBe("Unknown error");
    expect(describeError(undefined, "/").message).toBe("Unknown error");
  });
});
