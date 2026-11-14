// Creavia Cloud's tests (Vitest). Unit tests sit next to the code as `*.test.ts`; suites that sweep the whole service
// (every route signed out, later every route with another workspace's ids) live in test/. `@/` resolves as in Next.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: [{ find: /^@\/(.*)$/, replacement: `${here}/$1` }] },
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
    setupFiles: ["test/setup.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
