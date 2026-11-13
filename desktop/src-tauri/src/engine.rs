//! The engine on this computer: the same GPU worker the cloud uses (engine/gateway.py), run locally.
//!  - Install: a Python environment made by uv (installed for you if missing), with the gateway's few packages. Each AI
//!    engine then gets its own environment the first time it's used, and its weights from the Models page.
//!  - Start: on its own (local only: the desktop's MCP and screens use it), or lent to your Creavia Cloud (it runs
//!    engine/launcher.py, which opens a Cloudflare tunnel and checks in with the studio like a Colab worker does).
//!  - Stop: the whole process group, so engine processes it started stop too.
use crate::{store, sys, AppState};
use parking_lot::Mutex;
use serde::Serialize;
use std::{collections::VecDeque, path::PathBuf, process::Stdio, sync::Arc, time::Duration};
use tauri::{ipc::Channel, AppHandle, Manager, State};
use tokio::{io::{AsyncBufReadExt, BufReader}, process::{Child, Command}};

#[derive(Default)]
pub struct Engine {
    child: Mutex<Option<Child>>,
    pid: Mutex<Option<u32>>,
    linked: Mutex<bool>,
    port: Mutex<u16>,
    pub logs: Arc<Mutex<VecDeque<String>>>,
    last_error: Mutex<Option<String>>,
    tunnel: Arc<Mutex<Option<String>>>,
}

#[derive(Serialize)]
pub struct EngineStatus {
    installed: bool, running: bool, healthy: bool, port: u16, linked: bool, tunnel: Option<String>, pid: Option<u32>,
    engine_dir: Option<String>, last_error: Option<String>,
}

const LAUNCHER_PORT: u16 = 8000; // engine/launcher.py's fixed port

pub fn engine_dir(app: &AppHandle) -> Option<PathBuf> {
    engine_dir_in(app.path().resource_dir().ok())
}

pub fn engine_dir_in(resources: Option<PathBuf>) -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("CREAVIA_ENGINE_DIR").map(PathBuf::from) { return Some(p); }
    if let Some(r) = resources {
        let p = r.join("engine");
        if p.join("gateway.py").is_file() { return Some(p); }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../engine");
    dev.join("gateway.py").is_file().then(|| dev.canonicalize().unwrap_or(dev))
}

fn venv() -> PathBuf { store::data_dir().join("engine-venv") }
fn venv_python() -> PathBuf {
    if cfg!(windows) { venv().join("Scripts").join("python.exe") } else { venv().join("bin").join("python") }
}

fn push_log(logs: &Mutex<VecDeque<String>>, line: String) {
    let mut l = logs.lock();
    if l.len() >= 600 { l.pop_front(); }
    l.push_back(line);
}

pub type Say = Arc<dyn Fn(String) + Send + Sync>;

async fn run_logged(mut cmd: Command, on: &Say, logs: &Arc<Mutex<VecDeque<String>>>) -> Result<(), String> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let (out, err) = (child.stdout.take().unwrap(), child.stderr.take().unwrap());
    let pump = |r: Box<dyn tokio::io::AsyncRead + Unpin + Send>, on: Say, logs: Arc<Mutex<VecDeque<String>>>| tokio::spawn(async move {
        let mut lines = BufReader::new(r).lines();
        while let Ok(Some(l)) = lines.next_line().await { on(l.clone()); push_log(&logs, l); }
    });
    let a = pump(Box::new(out), on.clone(), logs.clone());
    let b = pump(Box::new(err), on.clone(), logs.clone());
    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = tokio::join!(a, b);
    if status.success() { Ok(()) } else { Err(format!("exited with {status}")) }
}

fn uv_path() -> Option<String> { sys::which("uv") }

#[tauri::command]
pub async fn engine_install(on_log: Channel<String>, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let dir = engine_dir(&app).ok_or("The engine's files are missing from this install")?;
    let say: Say = Arc::new(move |l| { let _ = on_log.send(l); });
    install(&state, dir, say).await
}

pub async fn install(state: &AppState, dir: PathBuf, on_log: Say) -> Result<(), String> {
    if cfg!(windows) {
        return Err("The local engine runs on macOS and Linux for now. On Windows, run it in WSL2, or lend a cloud GPU (Colab, Kaggle, Modal) to your studio.".into());
    }
    let logs = state.engine.logs.clone();
    let say = |s: &str| { on_log(s.to_string()); push_log(&logs, s.to_string()); };
    if uv_path().is_none() {
        say("Installing uv (Astral's Python manager)…");
        let mut c = Command::new("sh");
        c.args(["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"]);
        run_logged(c, &on_log, &logs).await.map_err(|e| format!("Couldn't install uv: {e}"))?;
    }
    let uv = uv_path().ok_or("uv didn't install: see the log")?;
    say("Making the engine's Python environment (3.11)…");
    let mut c = Command::new(&uv);
    c.args(["venv", "--python", "3.11", "--allow-existing"]).arg(venv());
    run_logged(c, &on_log, &logs).await?;
    say("Installing the engine's packages…");
    let mut c = Command::new(&uv);
    c.args(["pip", "install", "--python"]).arg(venv_python()).arg("-r").arg(dir.join("requirements-local.txt"));
    run_logged(c, &on_log, &logs).await?;
    if sys::which("ffmpeg").is_none() {
        say("Note: ffmpeg isn't installed. Clean-up, subtitles and video need it (macOS: brew install ffmpeg; Linux: your package manager).");
    }
    say("The engine is ready.");
    Ok(())
}

fn status_of(state: &AppState, dir: Option<PathBuf>, healthy: bool) -> EngineStatus {
    let running = state.engine.child.lock().as_mut().map(|c| c.try_wait().ok().flatten().is_none()).unwrap_or(false);
    EngineStatus {
        installed: venv_python().is_file(),
        running, healthy: running && healthy,
        port: *state.engine.port.lock(),
        linked: *state.engine.linked.lock(),
        tunnel: state.engine.tunnel.lock().clone(),
        pid: if running { *state.engine.pid.lock() } else { None },
        engine_dir: dir.map(|p| p.to_string_lossy().into_owned()),
        last_error: state.engine.last_error.lock().clone(),
    }
}

pub fn secret(state: &AppState) -> String {
    state.store.secret("engine_secret").unwrap_or_else(|| {
        let t = store::token("crv_engine_");
        state.store.set_secret("engine_secret", Some(&t));
        t
    })
}

/// The engine's address and key, when it's running (the MCP server and screens call it).
pub fn endpoint(state: &AppState) -> Option<(String, String)> {
    let running = state.engine.child.lock().as_mut().map(|c| c.try_wait().ok().flatten().is_none()).unwrap_or(false);
    if !running { return None; }
    let key = if *state.engine.linked.lock() { state.store.secret("cloud_worker_secret")? } else { secret(state) };
    Some((format!("http://127.0.0.1:{}", *state.engine.port.lock()), key))
}

async fn healthy(state: &AppState) -> bool {
    let Some((base, key)) = endpoint(state) else { return false };
    state.net.client.get(format!("{base}/health")).bearer_auth(key).timeout(Duration::from_secs(3)).send().await
        .map(|r| r.status().is_success()).unwrap_or(false)
}

#[tauri::command]
pub async fn engine_status(app: AppHandle, state: State<'_, AppState>) -> Result<EngineStatus, String> {
    let h = healthy(&state).await;
    Ok(status_of(&state, engine_dir(&app), h))
}

#[tauri::command]
pub async fn engine_start(link_cloud: bool, worker_secret: Option<String>, app: AppHandle, state: State<'_, AppState>) -> Result<EngineStatus, String> {
    let dir = engine_dir(&app).ok_or("The engine's files are missing from this install")?;
    start(&state, dir.clone(), link_cloud, worker_secret).await?;
    Ok(status_of(&state, Some(dir), healthy(&state).await))
}

pub async fn start(state: &AppState, dir: PathBuf, link_cloud: bool, worker_secret: Option<String>) -> Result<(), String> {
    if state.engine.child.lock().as_mut().map(|c| c.try_wait().ok().flatten().is_none()).unwrap_or(false) {
        return Ok(());
    }
    if !venv_python().is_file() { return Err("Set up the engine first".into()); }
    let settings = state.store.settings();
    let home = store::engine_home(&settings);
    if let Some(ws) = worker_secret.filter(|s| !s.trim().is_empty()) { state.store.set_secret("cloud_worker_secret", Some(ws.trim())); }
    let mut cmd = Command::new(venv_python());
    let port;
    if link_cloud {
        let cloud = settings.cloud_url.clone().ok_or("Connect to your studio first")?;
        let ws = state.store.secret("cloud_worker_secret").ok_or("Paste your studio's worker secret (Settings → GPU & engines in your studio)")?;
        cmd.arg(dir.join("launcher.py")).env("WORKER_SECRET", ws).env("REGISTER_URL", format!("{cloud}/api/register"))
            .env("VOICEBOX_BACKEND", "desktop");
        port = LAUNCHER_PORT;
    } else {
        port = settings.engine_port;
        cmd.arg(dir.join("gateway.py")).arg("--port").arg(port.to_string()).env("WORKER_SECRET", secret(state));
    }
    let mut path = std::env::var_os("PATH").unwrap_or_default();
    if let Some(uv) = uv_path() {
        if let Some(d) = PathBuf::from(uv).parent() { path = std::env::join_paths(std::iter::once(d.to_path_buf()).chain(std::env::split_paths(&path))).unwrap_or(path); }
    }
    cmd.current_dir(&dir).env("VOICEBOX_HOME", &home).env("VOICEBOX_STARTED_BY", "app").env("PATH", path)
        .env("PYTHONUNBUFFERED", "1").stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    if let Some(t) = state.store.secret("hf_token") { cmd.env("HF_TOKEN", t); }
    #[cfg(unix)]
    cmd.process_group(0);
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let logs = state.engine.logs.clone();
    let tunnel = state.engine.tunnel.clone();
    *tunnel.lock() = None;
    for r in [Box::new(child.stdout.take().unwrap()) as Box<dyn tokio::io::AsyncRead + Unpin + Send>, Box::new(child.stderr.take().unwrap())] {
        let (logs, tunnel) = (logs.clone(), tunnel.clone());
        tokio::spawn(async move {
            let mut lines = BufReader::new(r).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                if let Some(i) = l.find("https://").filter(|_| l.contains("trycloudflare.com")) {
                    let u: String = l[i..].chars().take_while(|c| !c.is_whitespace() && *c != '|').collect();
                    *tunnel.lock() = Some(u);
                }
                push_log(&logs, l);
            }
        });
    }
    *state.engine.pid.lock() = child.id();
    *state.engine.child.lock() = Some(child);
    *state.engine.linked.lock() = link_cloud;
    *state.engine.port.lock() = port;
    *state.engine.last_error.lock() = None;
    // wait up to 40 s for it to answer
    for _ in 0..80 {
        if healthy(state).await { break; }
        let dead = state.engine.child.lock().as_mut().map(|c| c.try_wait().ok().flatten().is_some()).unwrap_or(true);
        if dead {
            let tail: Vec<String> = state.engine.logs.lock().iter().rev().take(6).cloned().collect();
            let msg = format!("The engine stopped: {}", tail.into_iter().rev().collect::<Vec<_>>().join(" / "));
            *state.engine.last_error.lock() = Some(msg.clone());
            return Err(msg);
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Ok(())
}

pub fn stop(state: &AppState) {
    let child = state.engine.child.lock().take();
    if let Some(mut c) = child {
        #[cfg(unix)]
        if let Some(pid) = c.id() {
            let _ = std::process::Command::new("kill").args(["-TERM", &format!("-{pid}")]).status();
        }
        let _ = c.start_kill();
    }
    *state.engine.tunnel.lock() = None;
}

#[tauri::command]
pub async fn engine_stop(app: AppHandle, state: State<'_, AppState>) -> Result<EngineStatus, String> {
    stop(&state);
    tokio::time::sleep(Duration::from_millis(300)).await;
    Ok(status_of(&state, engine_dir(&app), false))
}

#[tauri::command]
pub fn engine_logs(state: State<'_, AppState>) -> Vec<String> { state.engine.logs.lock().iter().cloned().collect() }
