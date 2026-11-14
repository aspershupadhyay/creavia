//! Crash reports, only when the person turns them on (Settings: `crash_reports`, off by default; docs/ENGINEERING.md).
//!
//! - The Sentry DSN is built in by the release workflow (`CREAVIA_SENTRY_DSN`). A build without it, or a fork, has no
//!   reports and shows no switch.
//! - What is sent: the error, where in Creavia's code it happened, the app version and the operating system. Never the
//!   computer's name, the person, their files' paths, their studio or anything they made (`scrub_event`).
//! - The web view's errors come here (`crash_report_web`) and leave through Rust, like every other network call, so the
//!   web view never holds the DSN or talks to Sentry itself.
use parking_lot::Mutex;
use serde::Deserialize;
use std::{
    borrow::Cow,
    path::Path,
    sync::atomic::{AtomicBool, AtomicU32, Ordering},
    time::Duration,
};

/// Built in at release time; `None` in development and in forks.
const DSN: Option<&str> = option_env!("CREAVIA_SENTRY_DSN");
/// The engine's own project (engine/crashreports.py), passed to the engine on this computer.
const ENGINE_DSN: Option<&str> = option_env!("CREAVIA_ENGINE_SENTRY_DSN");

/// At most this many web view errors per run: a page stuck in a loop must not flood anyone's quota or connection.
const WEB_ERRORS_PER_RUN: u32 = 20;

/// The person's choice, checked on every event (`allow`): turning reports off stops them at once, on every thread,
/// without restarting or closing anything.
static ENABLED: AtomicBool = AtomicBool::new(false);
/// The client lives for the whole run; it is made once at start, so every thread's hub has it.
static CLIENT: Mutex<Option<sentry::ClientInitGuard>> = Mutex::new(None);
static WEB_ERRORS_SENT: AtomicU32 = AtomicU32::new(0);

/// Whether this build can send crash reports at all (the switch is shown only then).
pub fn available() -> bool {
    DSN.is_some_and(|d| !d.trim().is_empty())
}

/// Called once at launch, before any other thread starts. Makes the client when this build has a DSN; whether
/// anything is sent is the person's choice (`set_enabled`), checked on every event.
pub fn start(enabled: bool) {
    set_enabled(enabled);
    let mut client = CLIENT.lock();
    if client.is_some() || !available() {
        return;
    }
    let mut options = sentry::ClientOptions::default();
    options.release = Some(Cow::Borrowed(concat!("creavia-desktop@", env!("CARGO_PKG_VERSION"))));
    options.environment = Some(Cow::Borrowed(if cfg!(debug_assertions) { "development" } else { "production" }));
    options.send_default_pii = false;
    options.auto_session_tracking = false; // no session pings: only errors, and only with consent
    options.before_send = Some(std::sync::Arc::new(|event| allow(ENABLED.load(Ordering::Relaxed), event)));
    *client = Some(sentry::init((DSN.unwrap_or_default(), options)));
    // Release builds abort on panic (Cargo.toml), which would kill a report still in the queue: send it first.
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        previous(info);
        if ENABLED.load(Ordering::Relaxed) {
            if let Some(client) = sentry::Hub::current().client() {
                client.flush(Some(Duration::from_secs(2)));
            }
        }
    }));
}

/// The switch on the This computer page. Takes effect for the next event; never blocks.
pub fn set_enabled(enabled: bool) {
    ENABLED.store(enabled, Ordering::Relaxed);
}

/// Whether reports are being sent right now.
pub fn active() -> bool {
    available() && ENABLED.load(Ordering::Relaxed)
}

/// Every event passes here: dropped unless the person said yes, scrubbed if they did.
fn allow(enabled: bool, event: sentry::protocol::Event<'static>) -> Option<sentry::protocol::Event<'static>> {
    enabled.then(|| scrub_event(event))
}

/// The local engine's address and where its consent is written. The engine reads the settings file before each
/// report (engine/crashreports.py), so the switch reaches a running engine too, both ways.
pub fn engine_reporting(settings_file: &Path) -> Option<(&'static str, String)> {
    ENGINE_DSN.filter(|d| !d.trim().is_empty()).map(|d| (d, settings_file.to_string_lossy().into_owned()))
}

/// Removes what identifies the person or their computer before anything leaves it.
pub fn scrub_event(mut event: sentry::protocol::Event<'static>) -> sentry::protocol::Event<'static> {
    event.server_name = None; // the computer's name
    event.user = None;
    event.request = None;
    event.breadcrumbs = Default::default(); // what happened before can include file names and page addresses
    if let Some(message) = event.message.take() {
        event.message = Some(scrub_text(&message));
    }
    for exception in event.exception.values.iter_mut() {
        if let Some(value) = exception.value.take() {
            exception.value = Some(scrub_text(&value));
        }
    }
    event
}

/// A person's home folder in an error message ("/Users/ana/Movies/take.wav") names them: it becomes "~".
pub fn scrub_text(text: &str) -> String {
    let mut out = text.to_owned();
    for home in home_dirs() {
        if !home.is_empty() {
            out = out.replace(&home, "~");
        }
    }
    out
}

fn home_dirs() -> Vec<String> {
    let mut dirs: Vec<String> = dirs::home_dir().map(|h| h.to_string_lossy().into_owned()).into_iter().collect();
    // the same folder written the other way on Windows
    if let Some(h) = dirs.first().cloned() {
        dirs.push(h.replace('\\', "/"));
    }
    dirs
}

/// A web view error, as `desktop/src/shell/crashes.ts` sends it.
#[derive(Deserialize)]
pub struct WebError {
    message: String,
    stack: Option<String>,
    /// the page's path inside the app (no host, no query)
    page: Option<String>,
}

/// The web view reports an uncaught error. Ignored unless reports are on, and capped per run.
#[tauri::command]
pub fn crash_report_web(error: WebError) {
    if !active() || WEB_ERRORS_SENT.fetch_add(1, Ordering::Relaxed) >= WEB_ERRORS_PER_RUN {
        return;
    }
    let message: String = scrub_text(&error.message).chars().take(500).collect();
    let stack: String = error.stack.map(|s| scrub_text(&s).chars().take(4000).collect()).unwrap_or_default();
    let page = error.page.map(|p| p.split(['?', '#']).next().unwrap_or_default().to_owned());
    sentry::with_scope(
        |scope| {
            scope.set_tag("source", "webview");
            if let Some(page) = &page {
                scope.set_tag("page", page);
            }
            if !stack.is_empty() {
                scope.set_extra("stack", stack.clone().into());
            }
        },
        || sentry::capture_message(&message, sentry::Level::Error),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use sentry::protocol::{Event, Exception, User};

    #[test]
    fn nothing_is_sent_without_a_built_in_dsn() {
        // the test build has no CREAVIA_SENTRY_DSN, like development and forks
        if DSN.is_none() {
            assert!(!available());
            start(true);
            assert!(!active(), "turning the switch on must not start Sentry without a DSN");
        }
    }

    #[test]
    fn nothing_leaves_without_consent_and_everything_that_does_is_scrubbed() {
        let event = || Event { server_name: Some("anas-macbook".into()), ..Default::default() };
        assert!(allow(false, event()).is_none(), "off: the event is dropped");
        let sent = allow(true, event()).expect("on: the event is sent");
        assert!(sent.server_name.is_none(), "and scrubbed first");
    }

    #[test]
    fn the_engine_learns_where_consent_is_kept() {
        let file = Path::new("/tmp/creavia/settings.json");
        match engine_reporting(file) {
            Some((_, path)) => assert_eq!(path, "/tmp/creavia/settings.json"),
            None => assert!(ENGINE_DSN.is_none(), "only a build without an engine DSN gives nothing"),
        }
    }

    #[test]
    fn the_event_loses_the_computer_name_and_the_person() {
        let event = Event {
            server_name: Some("anas-macbook".into()),
            user: Some(User { email: Some("ana@example.com".into()), ..Default::default() }),
            ..Default::default()
        };
        let out = scrub_event(event);
        assert!(out.server_name.is_none());
        assert!(out.user.is_none());
    }

    #[test]
    fn home_folders_become_a_tilde_in_messages_and_exceptions() {
        let Some(home) = dirs::home_dir().map(|h| h.to_string_lossy().into_owned()) else { return };
        let mut event = Event { message: Some(format!("can't open {home}/Movies/take.wav")), ..Default::default() };
        event.exception.values.push(Exception { value: Some(format!("{home}/secret")), ..Default::default() });
        let out = scrub_event(event);
        assert_eq!(out.message.as_deref(), Some("can't open ~/Movies/take.wav"));
        assert_eq!(out.exception.values[0].value.as_deref(), Some("~/secret"));
    }

    #[test]
    fn web_errors_are_ignored_while_reports_are_off() {
        set_enabled(false);
        let before = WEB_ERRORS_SENT.load(Ordering::Relaxed);
        crash_report_web(WebError { message: "boom".into(), stack: None, page: Some("/local".into()) });
        assert_eq!(WEB_ERRORS_SENT.load(Ordering::Relaxed), before, "nothing counted, nothing sent");
    }
}
