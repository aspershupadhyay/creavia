# Stage 8: quality and security

**Status:** partly in place (typecheck, builds, self-check, install and app-open tests). **Done when:** all checks pass
on the release candidate and no high-severity issue is open.

| Check | Proves | Today |
| --- | --- | --- |
| Unit and integration tests | Each piece and route does what its story says | Partial |
| End-to-end (Playwright) | The ten core flows work in a browser | To add |
| App open tests, Windows/macOS/Linux | The installed app opens, shows Creavia, stays small | In place (`.github/workflows/install.yml`) |
| Workspace isolation | No route, tool or link shows another workspace's data | To add (Phase 0) |
| Agent evaluations | Saved tasks per agent: correct, on-brand, never beyond the dial | To add |
| Prompt-injection tests | Hostile comments, DMs, emails cannot make an agent post, send or pay | To add |
| Performance budgets | App opens < 2 s; screens show data < 1 s; low idle memory | To add |
| Accessibility audit | Contrast, labels, keyboard, screen reader on core flows | To add |
| Load test | Many workspaces posting and receiving DMs at once | To add |
| Security review | Outside penetration test of sign-in, sharing, MCP, payments before launch | To add |
