"use client";
// Workspace and team: the workspaces you're in (switch between them), the people in this one with their roles, and
// invites. Owners invite, change roles, remove people and take invites back; members see who's here. The links an
// invite makes are shown to copy until email sends them (docs/town/prd/foundation-workspaces-accounts.md, 3a).
import { ArrowLeft, Check, Copy } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Brand, Field } from "./ui";

type Role = "owner" | "member";
type Workspace = { id: string; name: string; role: Role };
type Member = { id: string; name: string; email: string; role: Role };
type Invite = { id: string; email: string; role: Role; expires_at: string };
type Me = { id: string; name: string; email: string } | null;

const json = async <T,>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: T & { error?: string } }> => {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  return { ok: r.ok, status: r.status, body: (await r.json().catch(() => ({}))) as T & { error?: string } };
};
const initials = (s: string) =>
  s
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join("") || "?";
const days = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

function RolePick({
  value,
  onPick,
  label,
  busy,
}: {
  value: Role;
  onPick: (r: Role) => void;
  label: string;
  busy?: boolean;
}) {
  return (
    <fieldset className="cv-seg" aria-label={label} disabled={busy} style={{ padding: 0, margin: 0 }}>
      {(["member", "owner"] as const).map((r) => (
        <button key={r} type="button" aria-pressed={value === r} onClick={() => value !== r && onPick(r)}>
          {r === "owner" ? "Owner" : "Member"}
        </button>
      ))}
    </fieldset>
  );
}

export default function Team() {
  const [me, setMe] = useState<Me>(null);
  const [spaces, setSpaces] = useState<Workspace[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [link, setLink] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState("");

  const load = useCallback(async () => {
    const [m, w, t, i] = await Promise.all([
      json<{ user: Me }>("/api/ws/me"),
      json<{ current: string | null; workspaces: Workspace[] }>("/api/ws/workspaces"),
      json<{ members: Member[] }>("/api/ws/team"),
      json<{ invites: Invite[] }>("/api/ws/invites"),
    ]);
    setMe(m.body.user ?? null);
    setSpaces(w.ok ? w.body.workspaces : null);
    setCurrent(w.ok ? w.body.current : null);
    setMembers(t.ok ? t.body.members : []);
    setInvites(i.ok ? i.body.invites : null); // null: not an owner here
    setLoaded(true);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const here = spaces?.find((s) => s.id === current);
  const owner = invites !== null; // only owners can read the invites
  const done = (text: string, bad = false) => {
    setMsg({ text, bad });
    setBusy(null);
  };

  async function switchTo(w: Workspace) {
    setBusy(`switch:${w.id}`);
    const r = await json("/api/ws/switch", { method: "POST", body: JSON.stringify({ workspace: w.id }) });
    if (!r.ok) return done(r.body.error ?? "Couldn't switch.", true);
    location.href = "/";
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviteErr("");
    setLink(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setInviteErr("Enter their email address.");
    setBusy("invite");
    const r = await json<{ link: string; email: string }>("/api/ws/invites", {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), role }),
    });
    setBusy(null);
    if (!r.ok) return setInviteErr(r.body.error ?? "Couldn't make the invite.");
    setLink({ email: r.body.email, link: r.body.link });
    setCopied(false);
    setEmail("");
    load();
  }

  async function setRoleOf(m: Member, r: Role) {
    setBusy(`role:${m.email}`);
    const res = await json("/api/ws/role", { method: "POST", body: JSON.stringify({ email: m.email, role: r }) });
    if (!res.ok) return done(res.body.error ?? "Couldn't change the role.", true);
    done(`${m.name || m.email} is ${r === "owner" ? "an owner" : "a member"} now.`);
    load();
  }

  async function remove(m: Member) {
    if (
      !confirm(`Remove ${m.name || m.email} from ${here?.name ?? "this workspace"}? They lose access within a minute.`)
    )
      return;
    setBusy(`remove:${m.email}`);
    const res = await json("/api/dash/security/remove", { method: "POST", body: JSON.stringify({ email: m.email }) });
    if (!res.ok) return done(res.body.error ?? "Couldn't remove them.", true);
    done(`${m.name || m.email} was removed.`);
    load();
  }

  async function revoke(i: Invite) {
    setBusy(`revoke:${i.id}`);
    const res = await json(`/api/ws/invites/${i.id}`, { method: "DELETE" });
    if (!res.ok) return done(res.body.error ?? "Couldn't take it back.", true);
    done(`The invite for ${i.email} no longer works.`);
    load();
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link.link).catch(() => null);
    setCopied(true);
  }

  return (
    <div className="cv">
      <div className="cv-wrap cv-rise">
        <div className="cv-top">
          <Brand />
          <a className="cv-btn cv-small" href="/">
            <ArrowLeft size={16} aria-hidden /> Back to the studio
          </a>
        </div>

        <div className="cv-stack" style={{ gap: 8 }}>
          <h1>{here?.name ?? "Workspace and team"}</h1>
          <p className="cv-sub">
            {here
              ? `You're ${here.role === "owner" ? "an owner" : "a member"} here.`
              : me
                ? ""
                : "Signed in with the access token: this is the studio's first workspace."}
          </p>
        </div>
        {msg && (
          <output className={`cv-note ${msg.bad ? "bad" : "ok"}`} style={{ marginTop: 20, display: "block" }}>
            {msg.text}
          </output>
        )}

        {spaces && spaces.length > 1 && (
          <section className="cv-section" aria-labelledby="cv-spaces">
            <h2 id="cv-spaces">Your workspaces</h2>
            <ul className="cv-list">
              {spaces.map((w) => (
                <li key={w.id}>
                  <div className="cv-avatar" aria-hidden>
                    {initials(w.name)}
                  </div>
                  <div className="cv-grow">
                    <div>{w.name}</div>
                    <div className="cv-sub cv-small">{w.role === "owner" ? "Owner" : "Member"}</div>
                  </div>
                  {w.id === current ? (
                    <span className="cv-pill brand">You're here</span>
                  ) : (
                    <button
                      type="button"
                      className="cv-btn cv-small"
                      disabled={busy === `switch:${w.id}`}
                      onClick={() => switchTo(w)}
                    >
                      Switch
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="cv-section" aria-labelledby="cv-people">
          <h2 id="cv-people">People</h2>
          {loaded && members.length === 0 && <p className="cv-sub">Nobody to show yet.</p>}
          {members.length > 0 && (
            <ul className="cv-list">
              {members.map((m) => {
                const self = me?.email.toLowerCase() === m.email.toLowerCase();
                return (
                  <li key={m.id}>
                    <div className="cv-avatar" aria-hidden>
                      {initials(m.name || m.email)}
                    </div>
                    <div className="cv-grow">
                      <div>
                        {m.name || m.email}
                        {self && <span className="cv-sub"> (you)</span>}
                      </div>
                      <div className="cv-sub cv-small">{m.email}</div>
                    </div>
                    {owner ? (
                      <div className="cv-actions">
                        <RolePick
                          value={m.role}
                          label={`Role of ${m.name || m.email}`}
                          busy={busy === `role:${m.email}`}
                          onPick={(r) => setRoleOf(m, r)}
                        />
                        {!self && (
                          <button
                            type="button"
                            className="cv-btn cv-small cv-danger"
                            disabled={busy === `remove:${m.email}`}
                            onClick={() => remove(m)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="cv-pill">{m.role === "owner" ? "Owner" : "Member"}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {loaded && !owner && <p className="cv-sub cv-small">Only owners can invite or remove people.</p>}
        </section>

        {owner && (
          <section className="cv-section" aria-labelledby="cv-invite">
            <h2 id="cv-invite">Invite someone</h2>
            <p className="cv-sub cv-small">
              The link works once, for that email only, for 7 days. Send it to them yourself.
            </p>
            <form className="cv-invite" onSubmit={invite} noValidate>
              <Field
                id="cv-invite-email"
                label="Their email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                invalid={!!inviteErr}
                errorId="cv-invite-err"
              />
              <RolePick value={role} onPick={setRole} label="Invite as" />
              <button type="submit" className="cv-btn cv-primary" disabled={busy === "invite"}>
                {busy === "invite" ? "One moment…" : "Make invite link"}
              </button>
            </form>
            <p className="cv-error" id="cv-invite-err" role="alert">
              {inviteErr}
            </p>
            {link && (
              <div className="cv-note ok">
                <div className="cv-stack" style={{ gap: 10 }}>
                  <span>Send this link to {link.email}:</span>
                  <div className="cv-row" style={{ flexWrap: "wrap" }}>
                    <code className="cv-mono cv-small cv-grow" style={{ wordBreak: "break-all" }}>
                      {link.link}
                    </code>
                    <button type="button" className="cv-btn cv-small" onClick={copy}>
                      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}{" "}
                      {copied ? "Copied" : "Copy link"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {invites && invites.length > 0 && (
              <>
                <h2 style={{ marginTop: 12 }}>Waiting to join</h2>
                <ul className="cv-list">
                  {invites.map((i) => (
                    <li key={i.id}>
                      <div className="cv-grow">
                        <div>{i.email}</div>
                        <div className="cv-sub cv-small">
                          {i.role === "owner" ? "Owner" : "Member"} · the link works {days(i.expires_at)} more day
                          {days(i.expires_at) === 1 ? "" : "s"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="cv-btn cv-small"
                        disabled={busy === `revoke:${i.id}`}
                        onClick={() => revoke(i)}
                      >
                        Take back
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
