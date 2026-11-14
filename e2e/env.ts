// Addresses and the throwaway key the end-to-end tests run with (playwright.config.ts starts the servers).
export const CLOUD = "http://localhost:3100";
export const DESKTOP = "http://localhost:4173";
/** The cloud's master key in these tests only: a made-up value, never a real studio's. */
export const TEST_MCP_TOKEN = "e2e-test-master-key-not-a-real-one";
