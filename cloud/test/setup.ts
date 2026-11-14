// Runs before every cloud test: no test may reach the network. A real fetch or WebSocket would mean a test talks to
// R2, Neon or a provider, which is slow, flaky and could touch real data, so both throw unless the test stubs them
// itself (vi.stubGlobal after this runs). The config's unstubGlobals puts them back after each test.
import { beforeEach, vi } from "vitest";

class NoNetwork extends Error {
  constructor(what: string) {
    super(`a test tried to reach the network (${what}); stub it with vi.stubGlobal`);
  }
}

beforeEach(() => {
  vi.stubGlobal("fetch", (input: unknown) => {
    throw new NoNetwork(`fetch ${String(input instanceof Request ? input.url : input)}`);
  });
  vi.stubGlobal(
    "WebSocket",
    class {
      constructor(url: string) {
        throw new NoNetwork(`WebSocket ${url}`);
      }
    },
  );
});
