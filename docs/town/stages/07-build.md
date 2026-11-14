# Stage 7: build

**Status:** ongoing per phase. **Done when:** every MVP story meets the definition of done in staging.

- One repository: `desktop/`, `cloud/`, `engine/`, `brand/`, `docs/` (PRDs and decision records beside the code).
- Three environments: development, staging (production copy with test accounts), production; staging first.
- Feature flags: unfinished houses ship dark; turned on per workspace for testers.
- Every change: a pull request, automatic checks, a review, then merge (CLAUDE.md → Shipping).
- Two-week cycles, each ending in something running in staging.
- Claude writes and reviews code under CLAUDE.md; a person approves what ships.

The full standard, with the definition of done, is [docs/ENGINEERING.md](../../ENGINEERING.md).

## Definition of done

- [ ] Meets its PRD's acceptance criteria
- [ ] Built only from design-system parts; checked at full width and 390 px
- [ ] Its actions are registry tools with permission levels
- [ ] Tests pass, including workspace isolation
- [ ] Usage tracked for its metric; errors reported
- [ ] Help text and the in-app guide updated
- [ ] Owner's feedback recorded in docs/FEEDBACK.md
