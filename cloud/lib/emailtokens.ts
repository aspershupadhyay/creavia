// One-time links sent by email (db/008_email_tokens.sql): a password reset (an hour) or the check of a new account's
// email (a day). The token is random and stored only as its hash; using it is one statement, so it works once even
// when two tabs open it together.
import { createHash, randomBytes } from "node:crypto";
import { sql } from "./db";

export type TokenKind = "reset" | "verify";
const MINUTES: Record<TokenKind, number> = { reset: 60, verify: 24 * 60 };
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const hash = (token: string) => createHash("sha256").update(`creavia-email-v1:${token}`).digest("hex");

/** A new link's token for this person; their earlier unused ones of the same kind stop working. */
export async function issueToken(kind: TokenKind, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await sql().query("delete from email_tokens where user_id = $1 and kind = $2 and used_at is null", [userId, kind]);
  await sql().query(
    "insert into email_tokens (token_hash, kind, user_id, expires_at) values ($1, $2, $3, now() + make_interval(mins => $4::int))",
    [hash(token), kind, userId, MINUTES[kind]],
  );
  return token;
}

/** Uses a link: the person it was for, or null when it's wrong, used or expired. */
export async function redeemToken(kind: TokenKind, token: string): Promise<string | null> {
  if (!TOKEN.test(token)) return null;
  const [r] = (await sql().query(
    "update email_tokens set used_at = now() where token_hash = $1 and kind = $2 and used_at is null and expires_at > now() returning user_id",
    [hash(token), kind],
  )) as { user_id: string }[];
  return r?.user_id ?? null;
}
