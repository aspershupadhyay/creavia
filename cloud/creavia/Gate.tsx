"use client";
// The way into Creavia (docs/town/stages/04-ux.md, "the first ten minutes", step 1): sign in, create an account, check
// your email, forget and reset a password, accept an invite, or use the master key. One screen, the form changing in
// place; every message says what to do next. It talks only to /api/login (lib/signin.ts decides who gets in where).
import { ArrowRight, GithubLogo, GoogleLogo } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Brand, Field, Trust } from "./ui";

type Mode = "signin" | "signup" | "forgot" | "sent" | "reset" | "check" | "token";
type Invite = { workspace: string; email: string; role: "owner" | "member" };

export type GateProps = {
  next: string;
  github?: string;
  google: boolean;
  mail: boolean;
  open: boolean;
  invite?: string;
  verify?: string;
  reset?: string;
  start?: "signup";
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const post = async (body: object) => {
  const r = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
};

const TITLES: Record<Mode, string> = {
  signin: "Sign in",
  signup: "Create your account",
  forgot: "Reset your password",
  sent: "Check your inbox",
  reset: "Choose a new password",
  check: "Check your email",
  token: "Use an access token",
};

export default function Gate(p: GateProps) {
  const [mode, setMode] = useState<Mode>(p.reset ? "reset" : p.start === "signup" || p.invite ? "signup" : "signin");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviteGone, setInviteGone] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [bad, setBad] = useState<"email" | "password" | "token" | "both" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const moved = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: focus moves to the first field each time the form changes
  useEffect(() => {
    if (moved.current) first.current?.focus();
    moved.current = true;
  }, [mode]);

  // an invite link: say which workspace it's for, with the invited email filled in
  useEffect(() => {
    if (!p.invite) return;
    fetch(`/api/login?invite=${encodeURIComponent(p.invite)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const i = (await r.json()) as Invite;
        setInvite(i);
        setEmail(i.email);
      })
      .catch(() => setInviteGone(true));
  }, [p.invite]);

  // the emailed link that checks a new account's email: open it and you're in
  useEffect(() => {
    if (!p.verify) return;
    setBusy(true);
    post({ verify: p.verify }).then((r) => {
      if (r.ok) {
        location.href = p.next;
        return;
      }
      setBusy(false);
      setMode("check");
      setErr(String(r.body.error ?? "That link didn't work. Ask for a new one below."));
    });
  }, [p.verify, p.next]);

  const go = () => {
    location.href = p.next;
  };
  const pick = (m: Mode) => {
    setMode(m);
    setErr("");
    setBad(null);
    setNote("");
  };
  const fail = (message: string, field: typeof bad = null) => {
    setErr(message);
    setBad(field);
    setBusy(false);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBad(null);
    setNote("");
    const mail = email.trim();
    // checked here, with the reason beside the field, rather than greying the button out
    if (mode === "token") {
      if (!token.trim()) return fail("Paste the access token.", "token");
    } else if (mode !== "reset" && !EMAIL.test(mail)) return fail("Enter your email address.", "email");
    if ((mode === "signin" || mode === "signup" || mode === "reset") && password.length < 8)
      return fail(
        mode === "signin"
          ? "Enter your password (at least 8 characters)."
          : "Use at least 8 characters for the password.",
        "password",
      );
    setBusy(true);
    const inv = invite && p.invite ? { invite: p.invite } : {};
    if (mode === "token") {
      const r = await post({ token: token.trim() });
      if (!r.ok) return fail(r.status === 429 ? String(r.body.error) : "That token didn't match.", "token");
      return go();
    }
    if (mode === "signin") {
      const r = await post({ email: mail, password, ...inv });
      if (r.ok) return go();
      if (r.body.verify) {
        setBusy(false);
        setMode("check");
        return setNote("Open the link we emailed you to finish signing up.");
      }
      return fail(String(r.body.error ?? "Couldn't sign in."), r.status === 401 ? "both" : null);
    }
    if (mode === "signup") {
      const r = await post({ signup: { name: name.trim(), email: mail, password }, ...inv });
      if (r.ok && r.body.verify) {
        setBusy(false);
        setMode("check");
        return setNote(String(r.body.message ?? `We emailed a link to ${mail}.`));
      }
      if (r.ok) return go();
      return fail(String(r.body.error ?? "Couldn't create the account."), r.body.exists ? "email" : null);
    }
    if (mode === "forgot") {
      const r = await post({ reset: { email: mail } });
      if (!r.ok) return fail(String(r.body.error ?? "Couldn't send the link."));
      setBusy(false);
      setMode("sent");
      return setNote(String(r.body.message));
    }
    if (mode === "reset") {
      const r = await post({ reset: { token: p.reset, password } });
      if (r.ok) return go();
      return fail(String(r.body.error ?? "Couldn't set the password."));
    }
    if (mode === "check") {
      const r = await post({ resend: { email: mail } });
      setBusy(false);
      return r.ok ? setNote(String(r.body.message)) : fail(String(r.body.error ?? "Couldn't send a new link."));
    }
  }

  const google = `/api/auth/google${invite && p.invite ? `?invite=${encodeURIComponent(p.invite)}` : ""}`;
  const sub: Record<Mode, string> = {
    signin: "Welcome back to your studio.",
    signup: invite
      ? `You're invited to ${invite.workspace}.`
      : p.open
        ? "Your own studio, ready in a minute."
        : "Only people the owner has invited can join.",
    forgot: "We'll email you a link to choose a new one.",
    sent: "If that email has an account here, the link is on its way.",
    reset: "At least 8 characters. Your other sign-ins end once it's set.",
    check: "One more step before you're in.",
    token: "For scripts and the self-hosted setup. It opens the studio's first workspace.",
  };
  const button: Partial<Record<Mode, string>> = {
    signin: "Continue",
    signup: "Create account",
    forgot: "Email me a link",
    reset: "Set password and sign in",
    check: "Send a new link",
    token: "Continue",
  };
  const asksEmail = mode === "signin" || mode === "signup" || mode === "forgot" || mode === "check";
  const asksPassword = mode === "signin" || mode === "signup" || mode === "reset";

  return (
    <div className="cv">
      <div className="cv-gate">
        <aside className="cv-gate-art">
          <Brand />
          <p className="cv-hello">Make, post and grow, with Vee beside you.</p>
          <Trust />
        </aside>
        <main className="cv-gate-form">
          <div className="cv-stack cv-rise" key={mode}>
            <div className="cv-stack" style={{ gap: 8 }}>
              <h1>{TITLES[mode]}</h1>
              <p className="cv-sub">{sub[mode]}</p>
            </div>

            {invite && (mode === "signin" || mode === "signup") && (
              <div className="cv-note">
                Joining <b>{invite.workspace}</b> as {invite.role === "owner" ? "an owner" : "a member"}, with{" "}
                {invite.email}.
              </div>
            )}
            {inviteGone && (
              <div className="cv-note bad">
                That invite has expired or been used. Ask whoever invited you for a new one.
              </div>
            )}
            {note && <output className="cv-note ok">{note}</output>}

            {(mode === "signin" || mode === "signup") && (p.google || (p.github && mode === "signin")) && (
              <>
                {p.google && (
                  <a className="cv-btn cv-block" href={google}>
                    <GoogleLogo size={18} weight="bold" aria-hidden /> Continue with Google
                  </a>
                )}
                {p.github && mode === "signin" && (
                  <a className="cv-btn cv-block" href={p.github}>
                    <GithubLogo size={18} weight="fill" aria-hidden /> Continue with GitHub
                  </a>
                )}
                <div className="cv-or" aria-hidden>
                  or
                </div>
              </>
            )}

            {mode !== "sent" && (
              <form onSubmit={submit} noValidate className="cv-stack">
                {mode === "token" && (
                  <Field
                    id="cv-token"
                    label="Access token"
                    type="password"
                    ref={first}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="current-password"
                    invalid={bad === "token"}
                    errorId="cv-err"
                  />
                )}
                {mode === "signup" && (
                  <Field
                    id="cv-name"
                    label="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    ref={first}
                  />
                )}
                {asksEmail && (
                  <Field
                    id="cv-email"
                    label="Email"
                    type="email"
                    value={email}
                    readOnly={!!invite && (mode === "signin" || mode === "signup")}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus={mode === "signin" && !p.invite}
                    ref={mode === "signup" ? undefined : first}
                    invalid={bad === "email" || bad === "both"}
                    errorId="cv-err"
                  />
                )}
                {asksPassword && (
                  <Field
                    id="cv-password"
                    label={mode === "reset" ? "New password" : "Password"}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    ref={mode === "reset" ? first : undefined}
                    hint={mode === "signin" ? undefined : "At least 8 characters."}
                    invalid={bad === "password" || bad === "both"}
                    errorId="cv-err"
                  />
                )}
                <p className="cv-error" id="cv-err" role="alert">
                  {err}
                </p>
                {button[mode] && (
                  <button type="submit" className="cv-btn cv-primary cv-block" disabled={busy}>
                    {busy ? (
                      "One moment…"
                    ) : (
                      <>
                        {button[mode]} <ArrowRight size={16} weight="bold" aria-hidden />
                      </>
                    )}
                  </button>
                )}
              </form>
            )}

            <div className="cv-stack cv-small" style={{ gap: 10 }}>
              {mode === "signin" && (
                <>
                  <span>
                    New here?{" "}
                    <button type="button" className="cv-link" onClick={() => pick("signup")}>
                      Create an account
                    </button>
                  </span>
                  {p.mail && (
                    <span>
                      <button type="button" className="cv-link" onClick={() => pick("forgot")}>
                        Forgot your password?
                      </button>
                    </span>
                  )}
                </>
              )}
              {mode !== "signin" && mode !== "reset" && (
                <span>
                  {mode === "signup" ? "Already have an account? " : ""}
                  <button type="button" className="cv-link" onClick={() => pick("signin")}>
                    {mode === "signup" ? "Sign in" : "Back to sign in"}
                  </button>
                </span>
              )}
              {mode === "signin" && (
                <span>
                  <button type="button" className="cv-link" onClick={() => pick("token")}>
                    Use an access token
                  </button>
                </span>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
