# Deploy your Creavia Cloud

Your studio online, on your own Cloudflare account. Cost: **Cloudflare Workers Paid, $5 a month** (the studio is a
~6 MB Worker with long-running requests; the free plan allows 3 MB), with R2's free 10 GB and Neon's free Postgres. Three steps; the app's *Deploy a cloud* page walks through the same.

## 1. A database

Make a free project at [neon.tech](https://console.neon.tech) and copy its connection string (`postgres://…`).
The studio makes its own tables the first time it's used.

## 2. Deploy

**One click:** [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aspershupadhyay/creavia/tree/main/cloud)

Cloudflare copies Creavia into your GitHub, makes the `creavia` R2 bucket, builds and deploys. It asks for:

| Setting | What to put |
|---|---|
| `MCP_TOKEN` | 24+ random characters: the studio's master key. Keep it. |
| `WORKER_SECRET` | 24+ random characters, shared with your GPU workers. Keep it. |
| `DATABASE_URL` | the Neon connection string |
| the rest | leave empty for now (see Extras) |

Random characters: `openssl rand -base64 30`, or any password manager.

**From a terminal:**

```bash
git clone https://github.com/aspershupadhyay/creavia && cd creavia && npm install
```

```bash
npm run cloud:deploy
```

It signs you in to Cloudflare, makes the bucket, asks for the database, makes both secrets (kept in
`cloud/.secrets.local`, gitignored), builds, deploys and prints your address. Run it again to update.

## 3. Create your account and connect

Open the address (`https://creavia-cloud.<you>.workers.dev`), create your account (the first one founds the studio),
then in the app: **Sign in** → **Use your own studio** → the address → sign in. Teammates: invite them from the
studio's `/account` page.

## Extras

| For | Set (Cloudflare → Workers → creavia-cloud → Settings → Variables and secrets) |
|---|---|
| Your own domain | Add it to the Worker, then `APP_URL=https://studio.example.com` |
| Uploads over 95 MB, GPU results straight to storage | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (R2 → Manage API tokens), and the bucket's CORS (`docs/r2-cors.json`) |
| A GPU | Lend this computer's (app → Engine → Lend), or Colab / Kaggle / Modal from the studio's Settings → GPU & engines (MODAL.md) |
| YouTube and Instagram publishing | PUBLISHING.md (Google Cloud and Meta apps; your own keys) |
| Faster model downloads on cloud GPUs | `HF_TOKEN` |
| Updates from your own repo's main | the Cloud workflow deploys when the repo has `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets |

## The address built into the app (for the people releasing Creavia)

Releases of the app sign in to the Creavia service without asking for an address: set the repository variable
`CREAVIA_SERVICE_URL` (GitHub → Settings → Secrets and variables → Actions → Variables) to the production Worker's
address before running the Desktop workflow. Unset, the app asks for a studio's address, as self-hosted builds do.
(docs/town/prd/foundation-app-connects.md)

## A staging copy (for the people building Creavia)

A second Worker, `creavia-cloud-staging`, with its own bucket and database and two test accounts, where every merge to
`main` is tested before production: `npm run setup -- --staging` from `cloud/`, then the GitHub variable and secrets it
prints. Why and how: [adr/0004-staging.md](adr/0004-staging.md).
