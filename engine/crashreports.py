"""Error reports from the engine to Sentry, only when it is given a SENTRY_DSN.

Who sets it: a cloud GPU worker gets it from its studio (/api/worker-env, the studio's ENGINE_SENTRY_DSN). On a
person's computer (CREAVIA_LOCAL=1) the desktop app passes it together with CREAVIA_CONSENT_FILE, its settings file,
and nothing is sent unless that file says crash_reports: true at the moment of the report, so turning the switch off
stops a running engine at once. Without a DSN nothing is sent, and a missing sentry_sdk package is not an error either
(docs/adr/0003-sentry.md).

What is sent: the error, its stack and the engine version. Never local variables (they hold scripts and voices), the
machine's name, or the person's home folder in paths.
"""

import json
import os
import re

_ACTIVE = False


def usable_dsn(dsn):
    """The DSN if it looks like one (`https://<key>@<host>/<project id>`), else None: a bad value turns reports off."""
    dsn = (dsn or "").strip()
    return dsn if re.fullmatch(r"https://[^@/\s]+@[^/\s]+/\d+", dsn) else None


def scrub_text(text, home=None):
    """A home folder in a message or path ("/home/ana/voices/take.wav") names the person: it becomes "~"."""
    home = home if home is not None else os.path.expanduser("~")
    if not text or not home or home in ("/", "~"):
        return text
    return text.replace(home, "~")


def consented(environ=None):
    """May a report leave now? On a cloud worker, yes (its studio chose). On a person's computer, only while their
    settings file says crash_reports: true; a missing or unreadable file means no."""
    environ = os.environ if environ is None else environ
    if environ.get("CREAVIA_LOCAL") != "1":
        return True
    try:
        with open(environ.get("CREAVIA_CONSENT_FILE") or "", encoding="utf-8") as f:
            return json.load(f).get("crash_reports") is True
    except (OSError, ValueError, AttributeError):  # no file, not JSON, not an object: no consent
        return False


def scrub_event(event, home=None):
    """Removes the machine's name, the user and home folders before an event leaves."""
    event.pop("server_name", None)
    event.pop("user", None)
    for exc in (event.get("exception") or {}).get("values") or []:
        if exc.get("value"):
            exc["value"] = scrub_text(exc["value"], home)
        for frame in (exc.get("stacktrace") or {}).get("frames") or []:
            frame.pop("vars", None)
            for key in ("abs_path", "filename"):
                if frame.get(key):
                    frame[key] = scrub_text(frame[key], home)
    if isinstance(event.get("message"), str):
        event["message"] = scrub_text(event["message"], home)
    logentry = event.get("logentry")
    if isinstance(logentry, dict):
        for key in ("message", "formatted"):
            if isinstance(logentry.get(key), str):
                logentry[key] = scrub_text(logentry[key], home)
        logentry.pop("params", None)  # a log call's arguments can be a script line or a path
    event.pop("breadcrumbs", None)
    event.pop("extra", None)
    return event


def _before_send(event, hint, environ=None):
    return scrub_event(event) if consented(environ) else None


def init(version, environ=None, sdk=None):
    """Starts reporting if SENTRY_DSN is set and sentry_sdk is installed. Returns whether it started."""
    global _ACTIVE
    environ = os.environ if environ is None else environ
    dsn = usable_dsn(environ.get("SENTRY_DSN"))
    if not dsn:
        return False
    if sdk is None:
        try:
            import sentry_sdk as sdk
        except ImportError:  # an engine set up before this existed: run without reports rather than fail
            return False
    sdk.init(
        dsn=dsn,
        release=f"creavia-engine@{version}",
        environment=environ.get("SENTRY_ENVIRONMENT") or ("local" if environ.get("CREAVIA_LOCAL") == "1" else "cloud"),
        # who the person is, local variables (they hold scripts and voices), request bodies and AI inputs stay here
        data_collection={
            "user_info": False,
            "cookies": False,
            "http_bodies": [],
            "gen_ai": {"inputs": False, "outputs": False},
            "database_query_data": False,
            "stack_frame_variables": False,
        },
        max_request_body_size="never",
        server_name="",
        traces_sample_rate=0,
        max_breadcrumbs=0,  # log lines before an error can quote a script or a path
        auto_session_tracking=False,
        before_send=lambda event, hint: _before_send(event, hint, environ),
    )
    _ACTIVE = True
    return True


def capture(error, kind):
    """Reports an error the engine caught itself (a failed job), tagged with the job kind. Never raises."""
    if not _ACTIVE:
        return
    try:
        import sentry_sdk

        with sentry_sdk.new_scope() as scope:
            scope.set_tag("job", kind)
            sentry_sdk.capture_exception(error)
    except Exception:  # noqa: BLE001  a report that can't be sent must never break the job loop
        pass
