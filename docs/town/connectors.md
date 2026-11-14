# Connectors and AI access

Every action in Creavia exists once, as a tool; the screens, Vee, the crew and any outside AI use the same tools, so
nothing is out of an AI's reach and nothing an AI does skips the app's rules.

## One tool registry

- Each tool: a plain name, a description, a worked example, a permission level. Grouped by house: `ideas.*`,
  `create.*`, `calendar.*`, `inbox.*`, `analytics.*`, `money.*`, `files.*`, `settings.*`.
- Screens call the tools; there is no separate AI version that can drift.
- `cloud/scripts/check-register.mts` (from VoiceBox) checks every tool registers and converts for each AI client.

| Level | Examples | What happens |
| --- | --- | --- |
| Read | List posts, read analytics, search files | Allowed |
| Make | Draft a script, voice a line, make a thumbnail | Allowed, logged |
| Change | Edit a post, move it, rename a file | Allowed, logged, undo |
| Act | Post, send a DM or email, send an invoice, spend credits, delete | Asks first, unless a rule you set allows it |

Every call is logged; a kill switch stops all automation (VoiceBox's approvals, call log and kill switch are the base).

## Any AI can use Creavia (MCP server)

- One address for Claude, ChatGPT, Gemini, Antigravity, Cursor, VS Code and your own model.
- OAuth, or a key per AI with its own permissions (ChatGPT may read and draft; Claude may also post).
- Tools load on demand: a small core, the rest by search (the adaptive endpoint, `lib/auto/endpoint.ts`).
- The desktop app also runs one locally (127.0.0.1, token, refuses foreign Origins).

## Creavia uses other services (connectors)

- One-click OAuth; switch each connector's tools on or off.
- Where a service has its own MCP server (Figma, Stripe, Notion, Canva), plug into it rather than rebuild.
- Tokens sealed on the server or in the keychain; never shown to the browser or a model.
- **Marketplace:** connector cards (what it does, what it sees, its tools, free / approval / paid), plugins (connectors
  plus recipes, publishable by creators), and "Use Creavia from your AI" setup.
- **Bring your own key:** ElevenLabs, OpenAI, Anthropic, Google, fal, Replicate; the creator pays the service.

## Bring your own key, like opencode

Every AI feature in Creavia runs on whatever the creator brings: they add a key, pick a provider and a model, and it
works at once. Creavia's own AI (for people with no key) is just another provider in the same list.

- **Providers:** Anthropic, OpenAI, Google (Gemini), xAI, Mistral, DeepSeek, Groq, OpenRouter, Together, Fireworks,
  Azure OpenAI, AWS Bedrock, any OpenAI-compatible endpoint, and local models through Ollama or LM Studio. Media
  providers too: ElevenLabs for voice, fal and Replicate for images and video.
- **Picking:** one default model for the crew, and an optional model per agent and per job (writing, sorting, vision,
  voice, images). A model list comes from an open model catalog (as opencode does), showing price, context size, and
  what each model can do (tools, images, audio).
- **Setup in one step:** paste a key or sign in where the provider offers it; Creavia tests it with one small call and
  shows "ready".
- **Safe keys:** on the desktop, keys stay in the system keychain (Rust); on the web, sealed on the server. Never in
  the page, never sent to a model, never in logs.
- **Clear costs:** each task shows which model ran and its token cost at that provider's prices; budgets per day and
  per agent.
- **Fallbacks:** if a provider fails or a key runs out, the task pauses and asks, or uses the backup model the creator
  chose; it never silently switches to a paid Creavia model.
- **Built on one provider layer** in the code (a provider-agnostic AI SDK), so adding a provider is configuration,
  not new code.

## Buckets

From memory as of late 2026; check each provider's current terms and prices before building on it.

### Free and quick
| Service | What for | Note | When |
| --- | --- | --- | --- |
| Stripe, Razorpay, PayPal | Payment links on invoices | Their usual fee per payment | Phase 3 |
| Figma | Show and export designs | Editing from outside is very limited | Phase 4 |
| Notion | Import ideas and scripts | Official MCP server | Phase 4 |
| Outlook | Brand-deal email | Lighter review than Gmail | Phase 3 |
| Drive, Dropbox (picked files) | Import files | Free while we only touch picked files | Phase 4 |
| Own keys: ElevenLabs, OpenAI, Anthropic, Google, fal, Replicate | AI | Creator pays | Phase 1 |
| The creator's computer | Voice, subtitles, clean-up, images | Free; big models need a GPU | Have |

### Free, needs approval
| Service | What for | Approval | When |
| --- | --- | --- | --- |
| YouTube | Posting, analytics, comments | Google verification (over ~100 users); upload quota increase | Start in Phase 0 |
| Instagram, Facebook | Posting, comments, DMs, analytics | Meta App Review per permission + business verification | Start in Phase 0 |
| TikTok | Posting | Audit; private posts until approved | Phase 4 |
| LinkedIn | Posting, pages | Partner approval for pages and analytics | Phase 4 |
| Canva | Designs into Files | Canva Connect review | Phase 4 |
| Gmail, send only | Invoices, replies | Google review for the send scope | Phase 3 |

### Paying
| Service | What for | Who pays | Cost | When |
| --- | --- | --- | --- | --- |
| Gmail, reading the inbox | Brand deals from email | Creavia, yearly | Restricted-scope security assessment (CASA), roughly hundreds to a few thousand USD a year | When revenue covers it |
| X API | Posting, analytics | Creavia, or the creator's own access | A paid API plan | Last |
| Full Drive / Dropbox access | Browse the whole drive | Creavia | Same review as Gmail | Avoid; use picked files |
| Creavia's own AI keys | AI for creators without a key or GPU | Creavia, passed on in paid plans | Per use | Phase 1, paid |
| Cloud GPUs (Modal, Kaggle, Colab…) | Voice, images, subtitles in the cloud | Creavia, in paid plans; free tiers first | Per minute | Phase 1, capped |
| Cloudflare Workers Paid | Running the service | Creavia | ~5 USD a month to start | Phase 0 |
| Neon, R2, B2 | Database and files | Creavia | Free tiers, then by use | Phase 0 |
| Domain, business registration | Needed for Meta and Google | Creavia | One-off and yearly | Phase 0 |

### Not possible or not allowed
| Service | Why | Instead |
| --- | --- | --- |
| Midjourney | No official public API | Flux, Ideogram, fal, our own engine |
| Downloading others' posts | Platform terms | Own content only in the public app |
| Scraping competitors | Platform terms | YouTube public stats, Instagram Business Discovery |

### Ways around a costly connector
- **Own Google login**: the creator's own Google Cloud project; no review, but Google signs them out every 7 days until
  published. Fine for power users and local mode.
- **Forward to Creavia**: a per-workspace address brand emails are forwarded to.
- **Outlook first**, Gmail later.
