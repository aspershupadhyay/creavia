#!/usr/bin/env node
// Deploy Creavia Cloud to your Cloudflare account from a terminal: `npm run cloud:deploy` (repo root) or `npm run setup`
// (in cloud/). It signs you in to Cloudflare (Wrangler), makes the storage bucket, asks for your database, makes the
// two secrets, builds, deploys, sets the secrets, and prints your studio's address. Safe to run again: it updates.
// The secrets it made are kept in cloud/.secrets.local (gitignored) so a re-run reuses them.
import { execSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEEP = path.join(here, ".secrets.local");
const bold = (s) => `\x1b[1m${s}\x1b[0m`, dim = (s) => `\x1b[2m${s}\x1b[0m`, ok = (s) => console.log(`\x1b[32m✓\x1b[0m ${s}`);
const run = (cmd, opts = {}) => spawnSync(cmd, { cwd: here, stdio: "inherit", shell: true, ...opts });
const out = (cmd) => { try { return execSync(cmd, { cwd: here, stdio: ["ignore", "pipe", "pipe"] }).toString(); } catch (e) { return `${e.stdout ?? ""}${e.stderr ?? ""}`; } };
const fail = (s) => { console.error(`\x1b[31m✗\x1b[0m ${s}`); process.exit(1); };

const kept = existsSync(KEEP) ? JSON.parse(readFileSync(KEEP, "utf8")) : {};
const save = () => { writeFileSync(KEEP, JSON.stringify(kept, null, 2)); try { chmodSync(KEEP, 0o600); } catch {} };
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q, def) => (await rl.question(`${q}${def ? dim(` (${def})`) : ""}: `)).trim() || def || "";

console.log(`\n${bold("Creavia Cloud")}: your own studio on Cloudflare.\n`);

// 1. Cloudflare
if (!/You are logged in|associated with the email/i.test(out("npx wrangler whoami"))) {
  console.log("Signing in to Cloudflare (a browser opens)…");
  if (run("npx wrangler login").status) fail("Cloudflare sign-in didn't finish.");
}
ok("Signed in to Cloudflare");

// 2. the bucket (files, voices, the studio's state)
const bucket = out("npx wrangler r2 bucket create creavia");
if (/already exists|created/i.test(bucket)) ok("Storage bucket: creavia");
else if (/enable R2|R2 is not enabled|10042/i.test(bucket)) fail("Turn on R2 first: Cloudflare dashboard → R2 → Get started (free tier), then run this again.");
else console.log(dim(bucket.trim()));

// 3. the database
if (!kept.DATABASE_URL) {
  console.log(`\nCreavia keeps posts, files and accounts in Postgres. Make a free project at ${bold("https://console.neon.tech")}`);
  console.log("and copy its connection string (Dashboard → Connect).\n");
  kept.DATABASE_URL = await ask("Database connection string (postgres://…)");
  if (!/^postgres(ql)?:\/\//.test(kept.DATABASE_URL)) fail("That isn't a postgres:// connection string.");
}
ok("Database");

// 4. the secrets: made once, reused on every run
kept.MCP_TOKEN ??= randomBytes(24).toString("base64url");
kept.WORKER_SECRET ??= randomBytes(24).toString("base64url");
save();
ok(`Secrets ready ${dim("(kept in cloud/.secrets.local)")}`);

// 5. build and deploy
console.log("\nBuilding (a minute or two)…");
if (run("npx opennextjs-cloudflare build").status) fail("The build failed: see above.");
console.log("Deploying…");
const deployed = spawnSync("npx opennextjs-cloudflare deploy", { cwd: here, shell: true, stdio: ["inherit", "pipe", "inherit"] });
const log = deployed.stdout?.toString() ?? "";
process.stdout.write(log);
if (deployed.status) fail("The deploy failed: see above.");
const url = log.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0] ?? kept.APP_URL ?? null;

// 6. the secrets onto the Worker (the bulk upload reads a file, then it's deleted)
const tmp = path.join(here, `.secrets-${process.pid}.json`);
const secrets = { MCP_TOKEN: kept.MCP_TOKEN, WORKER_SECRET: kept.WORKER_SECRET, DATABASE_URL: kept.DATABASE_URL };
for (const k of ["APP_URL", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "HF_TOKEN", "WORKSPACE_EMAILS"]) if (kept[k]) secrets[k] = kept[k];
writeFileSync(tmp, JSON.stringify(secrets));
try { if (run(`npx wrangler secret bulk "${tmp}"`).status) fail("Couldn't set the secrets: see above."); } finally { try { unlinkSync(tmp); } catch {} }
ok("Secrets set on the Worker");
if (url) { kept.URL = url; save(); }

rl.close();
console.log(`
${bold("Your studio is live")}${url ? ` at ${bold(url)}` : ""}.

  1. Open it and create your account: the first one founds the studio.
  2. In the Creavia app: Connect → paste the address → sign in.
  3. To lend this computer's GPU to it, the app asks for the worker secret:
     ${dim(kept.WORKER_SECRET)}

Your master key (token sign-in, scripts) and the worker secret are in cloud/.secrets.local. Keep them safe.
Optional extras (R2 keys for big uploads, YouTube and Instagram publishing): docs/DEPLOY.md.
`);
