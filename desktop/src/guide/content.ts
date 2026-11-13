// The guide's words. Written so a ten-year-old can follow: one idea per step, short sentences, the exact button
// names, a picture where it helps. **bold** and `code` work inside text. Keep it true: change it with the app.
import type { Scene } from "./art";

export const RELEASES = "https://github.com/aspershupadhyay/creavia/releases/latest";
export const DEPLOY = "https://deploy.workers.cloudflare.com/?url=https://github.com/aspershupadhyay/creavia/tree/main/cloud";
export const ISSUES = "https://github.com/aspershupadhyay/creavia/issues";

export type Action =
  | { label: string; to: string; cloud?: boolean }   // a page in the app (cloud: needs a connected studio)
  | { label: string; href: string }                   // a website
  | { label: string; copy: string }                   // copies text
  | { label: string; run: "check-update" };           // does something
export type Mock = { title: string; rows: { k: string; v: string; hi?: boolean }[]; button?: string };
export type Step = { title: string; text: string; pic?: Scene; mock?: Mock; code?: string[]; tip?: string; warn?: string; do?: Action[]; secrets?: boolean };
export type Chapter = { id: string; title: string; short: string; scene: Scene; mins: number; intro: string; steps: Step[]; part: "Start" | "Make" | "Online" | "More" };

export const CHAPTERS: Chapter[] = [
  {
    id: "meet", part: "Start", title: "Meet Creavia", short: "What it is", scene: "studio", mins: 1,
    intro: "Creavia is a little studio that lives on your computer. It turns your words into voiceovers, cleans up noisy sound, writes subtitles, makes pictures, and helps you post and grow.",
    steps: [
      { title: "Three helpers work together", text: "**The app** is what you are looking at now. **Models** are the AI brains: you download only the ones you want. **Your studio online** is optional: it keeps your posts and files on the internet so you can publish and share with your team." },
      { title: "Say hi to Vee", text: "Vee is the little one with the spark. When the spark **spins**, Vee is busy working. When Vee smiles, something finished." },
      { title: "Start with just the app", text: "You don't need anything else to begin. Download a model, turn on the engine, and make your first voice. You can put your studio online later, whenever you like.", do: [{ label: "Get a model", to: "/local/models" }] },
    ],
  },
  {
    id: "install", part: "Start", title: "Install Creavia", short: "Mac, Windows, Linux", scene: "install", mins: 3,
    intro: "Get Creavia onto your computer. You only do this once: after that it updates by itself.",
    steps: [
      { title: "Download the right file", text: "Open the download page and pick the file for your computer:\n• **Mac with an Apple chip** (M1, M2, M3, M4): the file ending in `aarch64.dmg`\n• **Older Mac with Intel**: the file ending in `x64.dmg`\n• **Windows**: the file ending in `setup.exe`\n• **Linux**: the `.AppImage` (works everywhere) or the `.deb`", do: [{ label: "Open the download page", href: RELEASES }], tip: "Not sure which Mac you have? Click the Apple menu → About This Mac. If it says “Chip: Apple M…”, take aarch64." },
      { title: "Mac: open it the first time", text: "Drag Creavia into **Applications**. The first time, **right-click** (or Control-click) Creavia and choose **Open**, then press **Open** again. Apple asks because Creavia is new, not because something is wrong.", pic: "unlock", tip: "No **Open** button (macOS 15 and later)? Open **System Settings → Privacy & Security**, scroll down, and press **Open Anyway** next to Creavia.", warn: "If your Mac says Creavia **“is damaged”**, it isn't: that's what macOS says about apps without a paid Apple certificate. Open **Terminal**, paste the line below, press Return, then open Creavia again.", code: ["xattr -dr com.apple.quarantine /Applications/Creavia.app"] },
      { title: "Windows: say yes to the blue box", text: "Run the setup file. If a blue box says **“Windows protected your PC”**, press **More info**, then **Run anyway**. Then follow the setup.", mock: { title: "Windows protected your PC", rows: [{ k: "App", v: "Creavia_setup.exe" }, { k: "Publisher", v: "Unknown publisher" }], button: "Run anyway" } },
      { title: "Linux: make it runnable", text: "For the AppImage, make it runnable once, then double-click it. On Ubuntu or Debian, the `.deb` installs with one line; on Fedora, the `.rpm`.", code: ["chmod +x Creavia_*.AppImage", "./Creavia_*.AppImage", "sudo apt install ./Creavia_*_amd64.deb", "sudo dnf install ./Creavia-*.x86_64.rpm"], tip: "If the AppImage mentions **FUSE**, install it once: `sudo apt install libfuse2t64` (on Ubuntu 22.04: `libfuse2`)." },
      { title: "That's it", text: "When a new version comes out, Creavia shows a small **Update** card. One click and it restarts with the new version. You never install it again." },
    ],
  },
  {
    id: "models", part: "Make", title: "Get your first AI model", short: "Download a brain", scene: "models", mins: 2,
    intro: "A model is an AI brain that's good at one job: speaking, listening, cleaning sound, or drawing. Creavia doesn't come with any, so it stays small. You pick the ones you want.",
    steps: [
      { title: "Open Models", text: "Click **Models** on the left. Each card is one brain: what it does, how big it is, and whether it fits your computer.", do: [{ label: "Open Models", to: "/local/models" }] },
      { title: "Look for the green line", text: "A **green line** under a card means it fits your computer. An orange one tells you why not, like “Needs an NVIDIA GPU”. **Commercial use** means you may use what it makes in paid work." },
      { title: "Press Download", text: "Press **Download**. No account, no password, no token: it comes straight from the people who made it. You see how much is left and how long it takes.", tip: "Start with **Kokoro**: it's small (350 MB) and runs on every computer, even without a graphics card." },
      { title: "If the internet hiccups", text: "Nothing is lost. Press **Resume** and it carries on from where it stopped. Every big file is checked when it arrives, and fetched again if it got damaged on the way." },
      { title: "Room for big models", text: "Video models can be 20 to 85 GB. If your main disk is small, change **Models folder** at the bottom of the Models page to a bigger disk before you download them." },
    ],
  },
  {
    id: "engine", part: "Make", title: "Turn on the engine", short: "Run models here", scene: "engine", mins: 3,
    intro: "The engine is the motor that runs your models. You set it up once, then turn it on and off like a light.",
    steps: [
      { title: "Install the engine", text: "Open **Engine** and press **Set up the engine**. It sets itself up in a few minutes (about 200 MB). You only do this once.", do: [{ label: "Open Engine", to: "/local/engine" }] },
      { title: "Press Start", text: "Press **Start**. When the dot turns **green**, the engine is running and your models are ready to use." },
      { title: "What your computer needs", text: "Kokoro runs on any Mac, Windows or Linux computer. The bigger models need an **NVIDIA graphics card**. No NVIDIA card? Use a free cloud GPU instead: see “Lend a GPU”.", warn: "On Windows, the engine runs inside **WSL2** for now (Windows' built-in Linux). Apple Silicon support for the big models is on the way." },
    ],
  },
  {
    id: "voice", part: "Make", title: "Make your first voiceover", short: "Words into voice", scene: "voice", mins: 2,
    intro: "Type what you want to say, and Creavia says it. Later, it can even say it in your own voice.",
    steps: [
      { title: "With your studio", text: "Open **Voiceover**, paste your script, pick a voice in the panel on the right, and press **Generate speech**. Play it, redo it or download it.", do: [{ label: "Open Voiceover", to: "/voiceover", cloud: true }] },
      { title: "Without a studio", text: "Ask your AI app to do it for you (see “Use it from Claude”). Say: “Use **local_voice** to say: Hi, I'm making my first voiceover.”" },
      { title: "Your own voice", text: "Open **Voices → Make a voice** and record 10 to 20 seconds of yourself reading. After that, every voiceover can sound like you.", do: [{ label: "Make a voice", to: "/voices/new", cloud: true }], tip: "Record somewhere quiet, close to the mic, in your normal speaking voice." },
    ],
  },
  {
    id: "host", part: "Online", title: "Put your studio online", short: "Host it on Cloudflare", scene: "cloud", mins: 10,
    intro: "Your studio online keeps your posts, files and voices on the internet: open it from any browser, post to YouTube and Instagram, and share it with your team. It runs on your own Cloudflare account, so it's yours.",
    steps: [
      { title: "Make a Cloudflare account", text: "Sign up at Cloudflare. Then in the dashboard: **Workers & Pages → Plans → Workers Paid**. Then open **R2** and press **Get started** (it's free up to 10 GB).", warn: "**What it costs:** Cloudflare Workers Paid is **$5 a month** (your studio is too big for the free plan). The database (Neon) and file storage (R2) are free to start. Cloudflare asks for a card.", do: [{ label: "Sign up at Cloudflare", href: "https://dash.cloudflare.com/sign-up" }] },
      { title: "Make a free database", text: "Sign up at **Neon** and make a new project (call it `creavia`). Press **Connect** and copy the connection string. It starts with `postgresql://`. Keep it for step 4.", pic: "keys", do: [{ label: "Open Neon", href: "https://console.neon.tech" }],
        mock: { title: "Neon · Connect to your database", rows: [{ k: "Connection string", v: "postgresql://neondb_owner:••••@ep-cool-name.neon.tech/neondb", hi: true }], button: "Copy" } },
      { title: "Make two secret keys", text: "Your studio needs two long secret passwords. Press the button: Creavia makes them for you. Copy each one and keep it safe, like in a password manager.", secrets: true },
      { title: "Press Deploy to Cloudflare", text: "Press the button. Sign in with **GitHub** (it copies Creavia into your own account), then with Cloudflare. When it asks for settings, paste:\n• `DATABASE_URL`: the string from step 2\n• `MCP_TOKEN`: the first key from step 3\n• `WORKER_SECRET`: the second key\nThen press **Create and deploy**.", do: [{ label: "Deploy to Cloudflare", href: DEPLOY }],
        mock: { title: "Deploy to Cloudflare", rows: [{ k: "Project name", v: "creavia-cloud" }, { k: "DATABASE_URL", v: "postgresql://…", hi: true }, { k: "MCP_TOKEN", v: "••••••••••••", hi: true }, { k: "WORKER_SECRET", v: "••••••••••••", hi: true }], button: "Create and deploy" } },
      { title: "Wait a few minutes", text: "Cloudflare builds your studio. When it's done, you get an address like `https://creavia-cloud.your-name.workers.dev`. Open it and **create your account**: the first account becomes the owner." },
      { title: "Connect the app", text: "Back in Creavia, open **Connect**, paste your studio's address, and sign in. Now every page of the studio is in the app too.", do: [{ label: "Open Connect", to: "/login" }] },
      { title: "Like terminals? One command", text: "Developers can do it all from a terminal instead. It signs in to Cloudflare, makes the storage, asks for the database, makes the keys, and deploys.", code: ["git clone https://github.com/aspershupadhyay/creavia && cd creavia && npm install", "npm run cloud:deploy"] },
    ],
  },
  {
    id: "connect", part: "Online", title: "Connect the app to your studio", short: "Sign in", scene: "connect", mins: 1,
    intro: "Connecting puts your online studio inside the app: posts, files, voices, publishing and analytics, all in one window.",
    steps: [
      { title: "Open Connect", text: "Click **Connect a studio** on the left, or press the button.", do: [{ label: "Open Connect", to: "/login" }] },
      { title: "Type the address and sign in", text: "Paste your studio's address (it starts with `https://`), then your email and password. New here? Use **New account**." },
      { title: "Your sign-in is safe", text: "Creavia keeps your sign-in in your computer's keychain. The screens never see your password or keys." },
    ],
  },
  {
    id: "gpu", part: "Online", title: "Lend a GPU to your studio", short: "Your GPU or a free one", scene: "gpu", mins: 3,
    intro: "Your online studio needs a graphics card (GPU) to make voices and pictures. It can borrow yours, or use a free one in the cloud.",
    steps: [
      { title: "Lend this computer's GPU", text: "Connect your studio first. Then open **Engine**, tick **Lend this GPU to my studio**, paste your studio's **WORKER_SECRET** (the second key from “Put your studio online”), and press **Start**. While it runs, your studio uses this computer's GPU.", do: [{ label: "Open Engine", to: "/local/engine" }] },
      { title: "Or a free cloud GPU", text: "No NVIDIA card? Your studio can start a free GPU on **Google Colab** or **Kaggle** by itself. Set it up in the studio's **Settings → GPU & engines**.", do: [{ label: "Open Settings", to: "/settings", cloud: true }] },
    ],
  },
  {
    id: "mcp", part: "More", title: "Use it from Claude or ChatGPT", short: "MCP, local or online", scene: "mcp", mins: 3,
    intro: "MCP is a plug that lets AI apps like Claude, ChatGPT and Cursor use Creavia's tools. You chat, and they make the voiceover, the subtitles or the post for you.",
    steps: [
      { title: "On this computer", text: "Open **MCP** and press **Start**. Pick your AI app and press **Copy**: paste that into the app's settings, then restart the app.", do: [{ label: "Open MCP", to: "/local/mcp" }] },
      { title: "From anywhere", text: "Your online studio has its own MCP at `https://<your studio>/api/mcp`. In **claude.ai**: Settings → Connectors → **Add custom connector**, paste that address, and sign in." },
      { title: "Try it", text: "Ask your AI app: “Make a voiceover of this script with Kokoro, then give me the subtitles.”" },
    ],
  },
  {
    id: "updates", part: "More", title: "Updates", short: "Automatic", scene: "update", mins: 1,
    intro: "Creavia keeps itself up to date. You never download it again.",
    steps: [
      { title: "A card appears", text: "When a new version is out, a small card says **“Creavia … is ready”**. Press **Update**: it downloads, installs, and restarts in a few seconds." },
      { title: "Nothing is lost", text: "Your models, settings and sign-in stay exactly where they were. Every update is signed, so Creavia only installs real ones." },
      { title: "Check right now", text: "Want to check without waiting?", do: [{ label: "Check for updates", run: "check-update" }] },
    ],
  },
  {
    id: "help", part: "More", title: "If something goes wrong", short: "Quick fixes", scene: "help", mins: 2,
    intro: "Most problems have a one-click fix. Here are the common ones.",
    steps: [
      { title: "A download stopped", text: "Press **Resume** on the model's card. It continues from where it stopped." },
      { title: "“Not enough disk”", text: "Free up space, or change the **Models folder** (bottom of the Models page) to a bigger disk." },
      { title: "The engine won't start", text: "Open **Engine** and read the last lines of the log. Press **Repair**: it sets itself up again." },
      { title: "“Needs an NVIDIA GPU”", text: "That model needs a graphics card your computer doesn't have. Use Kokoro here, or a free cloud GPU (see “Lend a GPU”)." },
      { title: "Can't sign in to the studio", text: "Check the address starts with `https://` and has no spaces. After many wrong passwords the studio pauses sign-ins for a while: wait, then try again." },
      { title: "Still stuck?", text: "Tell us what happened and what you see. We'll help.", do: [{ label: "Ask for help", href: ISSUES }] },
    ],
  },
];

export const PARTS = ["Start", "Make", "Online", "More"] as const;
