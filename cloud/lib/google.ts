// Google sign-in (docs/town/prd/foundation-workspaces-accounts.md, 3b): the standard OAuth code flow with
// GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the Worker. Google's word that the email is verified counts as the email
// check; which workspace the person lands in, and whether a new account may be made, is lib/signin.ts, as for a password.
export const GOOGLE_STATE = "vb_google_state";
export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function googleAuthUrl(state: string, redirect_uri: string) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  u.searchParams.set("redirect_uri", redirect_uri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "select_account");
  return u;
}

export type GoogleProfile = { email: string; verified: boolean; name: string };
/** Trades the callback's code for the person's email (verified or not) and name. */
export async function googleProfile(code: string, redirect_uri: string): Promise<GoogleProfile> {
  if (!code) throw new Error("Google sent no code.");
  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      redirect_uri,
      grant_type: "authorization_code",
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  });
  const t = (await tok.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!tok.ok || !t.access_token)
    throw new Error(`Google refused the sign-in${t.error_description ? `: ${t.error_description}` : ""}.`);
  const me = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${t.access_token}` },
  });
  const p = (await me.json().catch(() => ({}))) as { email?: string; email_verified?: boolean; name?: string };
  if (!me.ok || !p.email) throw new Error("Google didn't share the email.");
  return {
    email: p.email.trim().toLowerCase(),
    verified: p.email_verified === true,
    name: String(p.name ?? "").slice(0, 120),
  };
}
