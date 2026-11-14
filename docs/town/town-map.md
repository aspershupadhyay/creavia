# The town map

The town has a front gate (Home), five houses on the creator's loop (Ideas → Create → Calendar → Inbox → Analytics,
and what worked feeds the next ideas), and three houses every other one uses (Money, Files, Settings). Vee and the
crew work inside all of them ([agents.md](agents.md)). Each house's name is its plain name in the app's sidebar; the
town name is only how we talk about it.

## Who it is for, in order

1. Short-form creators on Instagram Reels and YouTube Shorts (the first focus).
2. Long-form YouTubers and podcasters.
3. Creators with an editor or manager, then small agencies running several creators.

## Each house

Status: **Have** (exists from VoiceBox), **Build**, **Connect** (another service), **Later**.

### Home (the front gate): your day on one page
| Feature | What it does | Status |
| --- | --- | --- |
| Today | What posts today, comments and DMs waiting, money owed, how the last post did | Build |
| Make next | Two or three ideas from your best recent posts, one click from a draft | Build |
| + New | Start anything: a video, post, idea, invoice, deal | Build |
| Crew line | What each agent did, what waits for you, what it is doing now | Build |

### Ask Vee (the guide): a chat that does things
| Feature | What it does | Status |
| --- | --- | --- |
| Chat that acts | Writes, voices, subtitles, schedules, replies, invoices, with the same tools as the buttons | Build |
| Approvals | Asks before anything posts, sends, spends or deletes | Have |
| Your memory | Your style, audience, brand kit, rates and what performed | Build |
| Recipes | Saved multi-step jobs: Shorts factory, launch week, brand-deal flow | Have (workflows) |
| Tasks | Every agent job, its steps, approve / change / stop | Build |
| Any model | Creavia's AI, your own key, or a model on your computer | Build |

### Ideas (the Idea Cafe), agent Juno — replaces notes apps, Notion boards, saved posts, vidIQ ideas
| Feature | What it does | Status |
| --- | --- | --- |
| Idea board | Idea → script → editing → ready | Have |
| Scripts | In your voice, one line per beat | Have |
| Trends | What is rising in your niche | Have (Radar) |
| Competitor ideas | What worked for creators like you | Have |
| From your best posts | Follow-ups to what already worked | Build |
| Save from anywhere | Share a link from phone or browser into Ideas | Later |

### Create (the Studio), agent Bolt — replaces ElevenLabs, CapCut subtitles, Descript clean-up, Midjourney/Canva thumbnails
| Feature | What it does | Status |
| --- | --- | --- |
| Voice | Clone your voice, text to speech, re-voice a rough take | Have |
| Clean audio | Remove noise and echo | Have |
| Subtitles | Transcribe and style captions | Have |
| Images and thumbnails | Generate and edit stills in your brand kit | Have |
| Download | Save your **own** posts and files from a link (others' content: not in the public app) | Have |
| Quick video edits | Trim, reframe to 9:16, burn captions, add intro | Build |
| Design | Figma and Canva designs into Files | Connect |
| Outside AI | ElevenLabs, OpenAI, fal and others with your own key | Connect |

### Calendar (the Post Office), agent Tempo — replaces Later, Buffer, Metricool
| Feature | What it does | Status |
| --- | --- | --- |
| Calendar | Every post on every platform by day; drag to move | Have |
| Auto-posting | YouTube and Instagram go out on time | Have |
| Post package | Title, description, tags, hashtags, credits | Have |
| Best time | Your audience's best slots, filled automatically | Have |
| Team approvals | An editor drafts, you approve | Build |
| More platforms | TikTok, LinkedIn, then X | Later |

### Inbox (the Town Square), agent Echo — replaces ManyChat and opening every app
| Feature | What it does | Status |
| --- | --- | --- |
| One inbox | Comments and DMs from every platform in one list | Build |
| Keyword auto-replies | Comment a word, get the link by DM | Have (AutoDM) |
| DM flows | Multi-step conversations | Build |
| Drafted replies | Echo drafts in your voice; one tap to send | Build |
| People | Tag fans, leads and brands; see history | Build |

### Analytics (the Observatory), agent Lens — replaces vidIQ, TubeBuddy, native insights
| Feature | What it does | Status |
| --- | --- | --- |
| Channel analytics | YouTube and Instagram, every post scored against your usual | Have |
| Audience and timing | Who watches and when | Have |
| Competitors | Pinned rivals | Have |
| Why it worked | Plain reasons, each with a Make this button | Build |
| Brand reports | A campaign's results as a page for the brand | Build |
| All platforms together | One view across accounts | Build |

### Money (the Bank), agent Penny — replaces spreadsheets, Wave, Linktree, Beacons
| Feature | What it does | Status |
| --- | --- | --- |
| Deals | Brands from first email to paid | Build |
| Invoices | Create, send with a Stripe/Razorpay payment link, see when paid | Build |
| Media kit | Live stats and rates as a page for brands | Build |
| Link in bio | Your links page, clicks counted | Build |
| Earnings | What came in, from whom, by month | Build |
| Products | Sell presets, guides, courses | Later |

### Files (the Warehouse), agent Atlas — replaces Drive and Dropbox for creator work
| Feature | What it does | Status |
| --- | --- | --- |
| Files | Folders, search, previews, trash | Have |
| Brand kit | Logo, fonts, colours, intro, outro used by every tool | Build |
| Templates | Thumbnails, captions, scripts, recipes | Build |
| Share and upload links | Send a file; let an editor upload to one folder | Have |
| Drive and Dropbox | Pull in picked files | Connect |

### Settings (the Town Hall)
| Feature | What it does | Status |
| --- | --- | --- |
| Connectors | The marketplace ([connectors.md](connectors.md)) | Build |
| Team | Invite, roles, approvals | Build |
| Where AI runs | This computer, your keys, or Creavia's cloud | Have (partly) |
| AI access | Keys for Claude, ChatGPT, Gemini…, each with its own permissions | Build (VoiceBox has `vbmk_` keys) |
| Plan and usage | Free or paid, GPU minutes, storage | Build |

## UI and UX

Ten sidebar items, one **+ New**, Vee everywhere; every other feature lives inside the ten.

- **Objects everything is made of:** Idea, Project (a video or campaign: script, voice, video, thumbnail, posts),
  Post (one piece, one platform, one time), File, Person (fan, lead, brand), Deal (links posts, report, invoice),
  Invoice, Task (an agent job). An object opens the same card everywhere.
- **Tools appear where you work:** open a project and its tools sit beside it; Create keeps them for one-off jobs.
- **Vee is one key away:** a side panel on every screen, Cmd/Ctrl K; Vee knows the screen you are on; results come
  back as editable objects; act-level steps show what will happen and wait for OK.
- **Rules for every screen:** one search, calendar, inbox and set of files · plain words (Voice, not TTS) · every
  empty screen teaches and offers one button · nothing irreversible without confirm, undo or a log · works at 390 px,
  same structure on web and app · the Creavia look (docs/DESIGN.md; no-AI-slop rules in
  [stages/05-visual-design.md](stages/05-visual-design.md)) · new features become a tab or tool inside a house,
  never a new sidebar item.

## Free and paid plans

| | Free | Creator (paid) | Team (paid) |
| --- | --- | --- | --- |
| Every house and tool | Yes | Yes | Yes |
| AI | Your computer or your own keys | + monthly cloud GPU and AI credits | More, shared |
| Social accounts | 2 | 10 | More, per creator |
| Automations and DM flows | A few | Unlimited | Unlimited |
| Team | Just you | Just you | Seats, roles, approvals |
| Media kit and reports | Creavia branding | Your branding | Per client |

A free user with a GPU or their own keys costs almost nothing; anyone who wants the cloud to do the heavy lifting pays
for exactly that. Prices are an open owner decision.

## How we handle the size

Principles: build, connect or skip · be best at what grows with use (what to make next, the one inbox, the crew's
memory) · the glue is the product (every feature passes objects between houses) · one way to do each thing · a house
opens only when it can cancel the tool it replaces · small, finished, shipped.

| Risk | Answer |
| --- | --- |
| Average at everything | One creator type first; one house at a time; the cancel-the-tool bar |
| Data leaking between workspaces | Workspace id on every row and file path, checked in one place; isolation tests on every route |
| Platform approvals slow or refused | Start Google and Meta reviews in Phase 0; policies ready; registered business; connect meanwhile |
| GPU and AI costs | Local models and own keys first; cloud credits only on paid plans; caps per workspace |
| Platform API changes | Each connector behind one adapter with tests and a status light |
| AI doing harm | Act-level tools ask first; logs, undo, rate limits, kill switch; injection tests |
| Hard to learn | Ten items, onboarding by goal, teaching empty screens, the guide, Vee |
| Breaking VoiceBox | Separate codebase; the app's API calls checked against the live server before each release |
| Too much to maintain | Use services' own MCP servers; connectors as plugins |

## Owner decisions (open)

- [ ] Who pays for AI on the free plan (recommended: only local models and own keys)
- [ ] Prices for Creator and Team
- [ ] A domain and a registered business (needed for Meta and Google reviews)
- [ ] The first creator type (recommended: short-form, Reels and Shorts)
- [ ] 10 to 15 creators to interview and test with
