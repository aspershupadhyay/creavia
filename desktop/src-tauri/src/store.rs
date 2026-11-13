//! Where Creavia keeps things on this computer, its settings, and its secrets.
//!
//! - `data_dir()`: the app's folder (settings, the engine's home, logs). Models live in `models_dir`, which you can move.
//! - Secrets (your studio session, tokens) go to the OS keychain on macOS and Windows. On Linux they go to a file only
//!   you can read (0600) in the app's folder; Secret Service support is on the roadmap (docs/PLAN.md).
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, path::PathBuf};

pub fn data_dir() -> PathBuf {
    let base = std::env::var_os("CREAVIA_HOME").map(PathBuf::from).unwrap_or_else(|| {
        dirs::data_local_dir().unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))).join("Creavia")
    });
    let _ = fs::create_dir_all(&base);
    base
}

/// The engine's home (VOICEBOX_HOME for engine/gateway.py): jobs, references, logs, and model weights under `hf/`.
pub fn engine_home(settings: &Settings) -> PathBuf {
    let p = PathBuf::from(&settings.models_dir);
    let _ = fs::create_dir_all(&p);
    p
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub models_dir: String,
    pub mcp_autostart: bool,
    pub mcp_port: u16,
    pub engine_autostart: bool,
    pub engine_port: u16,
    pub onboarded: bool,
    pub launch_at_login: bool,
    pub cloud_url: Option<String>,
    pub cloud_how: Option<String>,
    pub cloud_who: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            models_dir: data_dir().join("engine").to_string_lossy().into_owned(),
            mcp_autostart: false,
            mcp_port: 7377,
            engine_autostart: false,
            engine_port: 8765,
            onboarded: false,
            launch_at_login: false,
            cloud_url: None,
            cloud_how: None,
            cloud_who: None,
        }
    }
}

pub struct Store {
    settings: Mutex<Settings>,
    secrets: Mutex<BTreeMap<String, String>>, // the Linux file store (and a cache elsewhere)
}

fn settings_path() -> PathBuf { data_dir().join("settings.json") }
fn secrets_path() -> PathBuf { data_dir().join(".secrets.json") }

impl Store {
    pub fn load() -> Self {
        let settings = fs::read(settings_path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        let secrets = fs::read(secrets_path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Self { settings: Mutex::new(settings), secrets: Mutex::new(secrets) }
    }

    pub fn settings(&self) -> Settings { self.settings.lock().clone() }

    pub fn update(&self, f: impl FnOnce(&mut Settings)) -> Settings {
        let mut s = self.settings.lock();
        f(&mut s);
        let tmp = settings_path().with_extension("json.tmp");
        if fs::write(&tmp, serde_json::to_vec_pretty(&*s).unwrap_or_default()).is_ok() {
            let _ = fs::rename(&tmp, settings_path());
        }
        s.clone()
    }

    pub fn secret(&self, name: &str) -> Option<String> {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            if let Ok(e) = keyring::Entry::new("studio.creavia.app", name) {
                if let Ok(v) = e.get_password() { return Some(v); }
            }
        }
        self.secrets.lock().get(name).cloned()
    }

    pub fn set_secret(&self, name: &str, value: Option<&str>) {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            if let Ok(e) = keyring::Entry::new("studio.creavia.app", name) {
                let ok = match value { Some(v) => e.set_password(v).is_ok(), None => { let _ = e.delete_credential(); true } };
                if ok {
                    // keep nothing on disk once the keychain holds it
                    let mut m = self.secrets.lock();
                    if m.remove(name).is_some() { write_secrets(&m); }
                    return;
                }
            }
        }
        let mut m = self.secrets.lock();
        match value { Some(v) => { m.insert(name.into(), v.into()); } None => { m.remove(name); } }
        write_secrets(&m);
    }
}

fn write_secrets(m: &BTreeMap<String, String>) {
    let p = secrets_path();
    let tmp = p.with_extension("tmp");
    if fs::write(&tmp, serde_json::to_vec(m).unwrap_or_default()).is_ok() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
        }
        let _ = fs::rename(&tmp, &p);
    }
}

/// A random token: 32 bytes, URL-safe.
pub fn token(prefix: &str) -> String {
    use rand::Rng;
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut r = rand::rng();
    let s: String = (0..43).map(|_| A[r.random_range(0..A.len())] as char).collect();
    format!("{prefix}{s}")
}
