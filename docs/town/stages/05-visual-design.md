# Stage 5: visual design and design system

**Status:** not started (docs/DESIGN.md is the starting point). **Done when:** every MVP screen is built only from
library parts, and a review against the eight rules below passes.

| Part | Contents |
| --- | --- |
| Tokens | Matte black surfaces, one marigold accent, status colours; Geist and Geist Mono; 8 px grid; radii, borders, motion timings |
| Components | Buttons, inputs, Select, menus, dialogs, tabs, tables, cards, toasts, the post card, the agent task card, calendar cell, charts |
| Patterns | Empty states, loading, errors, approvals, the Vee panel, onboarding, settings |
| Motion | Pages rise in; only live things loop; reduced motion respected |
| Illustration | Vee and the crew ([../agents.md](../agents.md)), one style; empty states and the guide |
| Accessibility | Contrast 4.5:1+, every control labelled, full keyboard, visible focus |

## The no-AI-slop rules

1. No gradients, glows or glassmorphism; flat, matte surfaces; colour only where it means something.
2. One accent: marigold marks the one thing to do; never rainbow cards or purple-blue defaults.
3. Real content, never lorem ipsum or fake dashboards.
4. No emoji as icons, no sparkle icon on every AI feature; one icon set (Phosphor), used sparingly.
5. Density with air: information first, generous spacing, no oversized hero cards on working screens.
6. Words over decoration; Vee and the crew appear where warmth helps, not everywhere.
7. Consistency over novelty: the same card, button and dialog everywhere; a new pattern needs a reason.
8. AI output looks like your work, not a chat bubble: posts, scripts and invoices you can edit.

**Deliverables:** Figma library, tokens exported to code, component specs with every state, high-fidelity MVP screens.
