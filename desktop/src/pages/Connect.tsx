// Signing in from the app (docs/town/prd/foundation-app-connects.md): the same screen as the web
// (cloud/creavia/Gate.tsx: sign in, create an account, check your email, forgot password, access token), talking to
// the Creavia service built into the app, or to your own studio, the advanced way. Every step goes through Rust
// (cloud_auth), which keeps the session in the keychain: this screen only ever sees the studio's messages.
import "@/creavia/creavia.css";
import Gate, { GateFrame, type Send } from "@/creavia/Gate";
import { Field } from "@/creavia/ui";
import { ArrowRight } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cloudAuth, cloudWays, inTauri, signOutCloud, type Ways } from "../bridge/native";
import { useConn } from "../shell/conn";

const NONE: Ways = { google: false, mail: false, open: false };
const hostOf = (url: string) => url.replace(/^https?:\/\//, "");
const failed = (error: string, status = 0) => ({ ok: false, status, body: { error } });
const message = (e: unknown) => String((e as Error)?.message ?? e);

/** Your own studio's address: checked by reaching it (Rust refuses a bad or protected one) before the sign-in shows. */
function OwnStudio({
  initial,
  onPick,
  onCancel,
}: {
  initial: string;
  onPick: (url: string) => void;
  onCancel?: () => void;
}) {
  const [url, setUrl] = useState(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!url.trim()) return setErr("Enter your studio's address.");
    if (!inTauri()) return setErr("Open the Creavia app to connect.");
    setBusy(true);
    try {
      await cloudWays(url.trim());
      onPick(url.trim());
    } catch (e2) {
      setErr(message(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <GateFrame>
      <div className="cv-stack cv-rise">
        <div className="cv-stack" style={{ gap: 8 }}>
          <h1>Use your own studio</h1>
          <p className="cv-sub">For a Creavia Cloud you run yourself. Your posts, files and team stay on it.</p>
        </div>
        <form onSubmit={go} noValidate className="cv-stack">
          <Field
            id="cv-url"
            label="Studio address"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="studio.example.com"
            autoComplete="url"
            spellCheck={false}
            autoFocus
            hint="The address you open your studio at. https:// is added for you."
            invalid={!!err}
            errorId="cv-url-err"
          />
          <p className="cv-error" id="cv-url-err" role="alert">
            {err}
          </p>
          <button type="submit" className="cv-btn cv-primary cv-block" disabled={busy}>
            {busy ? (
              "One moment…"
            ) : (
              <>
                Continue <ArrowRight size={16} weight="bold" aria-hidden />
              </>
            )}
          </button>
        </form>
        <div className="cv-stack cv-small" style={{ gap: 10 }}>
          {onCancel && (
            <span>
              <button type="button" className="cv-link" onClick={onCancel}>
                Use Creavia instead
              </button>
            </span>
          )}
          <span>
            No studio yet?{" "}
            <Link className="cv-link" to="/local/deploy">
              Deploy one
            </Link>{" "}
            or read{" "}
            <Link className="cv-link" to="/guide/host" state={{ from: "/login" }}>
              the guide
            </Link>
            .
          </span>
          <span>
            <Link className="cv-link" to="/local">
              Back to this computer
            </Link>
          </span>
        </div>
      </div>
    </GateFrame>
  );
}

export default function Connect() {
  const nav = useNavigate();
  const { conn, refresh } = useConn();
  const service = conn?.service ?? null;
  // your own studio: the address you gave (a past connection to anything but the service counts); null: the service
  const [own, setOwn] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [ready, setReady] = useState(false);
  const [ways, setWays] = useState<Ways>(NONE);

  useEffect(() => {
    if (!conn || ready) return;
    const past = conn.url && conn.url !== service ? conn.url : null;
    setOwn(past);
    setAsking(!past && !service);
    setReady(true);
  }, [conn, service, ready]);

  useEffect(() => {
    if (!ready || asking || !inTauri()) return;
    setWays(NONE);
    cloudWays(own)
      .then(setWays)
      .catch(() => setWays(NONE));
  }, [ready, asking, own]);

  if (!conn || !ready) return null;

  if (asking)
    return (
      <>
        <div className="cr-drag top" data-tauri-drag-region />
        <OwnStudio
          initial={own ?? ""}
          onPick={(url) => {
            setOwn(url);
            setAsking(false);
          }}
          onCancel={
            service
              ? () => {
                  setOwn(null);
                  setAsking(false);
                }
              : undefined
          }
        />
      </>
    );

  const send: Send = async (body) => {
    if (!inTauri()) return failed("Open the Creavia app to sign in.");
    try {
      const a = await cloudAuth(own, body);
      // a sign-in the studio said yes to must have started a session (an emailed link or a message is fine)
      if (a.ok && !a.signed_in && !a.body.verify && !a.body.message)
        return failed("The studio didn't start a session. Try again.", 502);
      return a;
    } catch (e) {
      return failed(message(e));
    }
  };
  const signedIn = conn.mode === "cloud" && conn.url;
  const where = own ? hostOf(own) : "Creavia";

  return (
    <>
      <div className="cr-drag top" data-tauri-drag-region />
      <Gate
        key={own ?? "service"}
        google={false /* in the app, part 2: the browser and a one-time code */}
        mail={ways.mail}
        open={ways.open}
        send={send}
        onDone={async () => {
          await refresh();
          nav("/home", { replace: true });
        }}
        tokenNote={
          own
            ? "For a studio you run alone. It opens the studio's first workspace."
            : "Only for whoever runs this Creavia service."
        }
        notice={
          signedIn ? (
            <div className="cv-note">
              Signed in to <b>{hostOf(conn.url as string)}</b> as {conn.who}.{" "}
              <button
                type="button"
                className="cv-link"
                onClick={async () => {
                  await signOutCloud();
                  await refresh();
                }}
              >
                Sign out
              </button>
            </div>
          ) : null
        }
        footer={
          <>
            <span>
              {own ? (
                <>
                  Signing in to <b>{where}</b>.{" "}
                  <button type="button" className="cv-link" onClick={() => setAsking(true)}>
                    Change
                  </button>
                  {service && (
                    <>
                      {" · "}
                      <button type="button" className="cv-link" onClick={() => setOwn(null)}>
                        Use Creavia instead
                      </button>
                    </>
                  )}
                </>
              ) : (
                <button type="button" className="cv-link" onClick={() => setAsking(true)}>
                  Use your own studio
                </button>
              )}
            </span>
            <span>
              <Link className="cv-link" to="/local">
                Back to this computer
              </Link>
            </span>
          </>
        }
      />
    </>
  );
}
