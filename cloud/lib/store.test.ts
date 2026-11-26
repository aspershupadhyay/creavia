// Which bucket the cloud talks to (lib/store.ts): the R2 binding only when it is the same bucket presigned links name.
import { describe, expect, it } from "vitest";
import { usesBinding } from "./store";

describe("usesBinding", () => {
  it("uses the binding for production's bucket and the staging copy's", () => {
    expect(usesBinding(undefined, undefined)).toBe(true);
    expect(usesBinding("creavia", undefined)).toBe(true);
    expect(usesBinding("creavia-staging", undefined)).toBe(true);
  });

  it("goes over the S3 API for any other bucket or store, so reads and links never point at two buckets", () => {
    expect(usesBinding("someone-elses", undefined)).toBe(false);
    expect(usesBinding("creavia", "http://localhost:9000")).toBe(false);
  });
});
