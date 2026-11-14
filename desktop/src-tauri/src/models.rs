//! Models: none ship with Creavia. You pick what to download (like ComfyUI), and only then is it fetched, straight
//! from its maker (Hugging Face or GitHub) into the folder the engine reads:
//!   <models_dir>/hf/<engine>/hub/models--<org>--<name>/snapshots/<commit>/…   (Hugging Face's own cache layout)
//! so engine/gateway.py finds the weights already there and never downloads them again. Downloads resume after a
//! dropped connection, run four files at a time, and report progress to the screen.
//! No account and no token: every model in the catalogue is public, so like ComfyUI it just downloads. Each big file
//! is checked against the SHA-256 its maker published (Hugging Face's LFS record) and fetched again if it doesn't match.
//! A Hugging Face token (Models → Advanced) is optional: it only lifts the anonymous rate limit.
use crate::{store, AppState};
use futures_util::{stream, StreamExt};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::{ipc::Channel, State};
use tokio::io::AsyncWriteExt;

const CATALOG: &str = include_str!("../models.json");
const IGNORE: &[&str] = &[".msgpack", ".h5", ".ot", ".gguf", ".onnx"]; // the formats the engines never load (gateway.py)

#[derive(Deserialize, Serialize, Clone)]
pub struct Source {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hf: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct Model {
    pub id: String,
    pub engine: String,
    pub name: String,
    pub maker: String,
    pub kind: String,
    pub about: String,
    pub license: String,
    pub commercial: bool,
    pub disk_gb: f64,
    pub vram_gb: f64,
    #[serde(default)]
    pub languages: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub sources: Vec<Source>,
    #[serde(default)]
    pub needs: Option<String>,
}

#[derive(Serialize)]
pub struct Entry {
    #[serde(flatten)]
    m: Model,
    repos: Vec<String>,
}

pub fn catalog() -> Vec<Model> {
    serde_json::from_str(CATALOG).expect("models.json")
}

#[derive(Default)]
pub struct Downloads {
    live: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

pub fn engine_cache(state: &AppState, engine: &str) -> PathBuf {
    store::engine_home(&state.store.settings()).join("hf").join(engine)
}
fn marker(dir: &Path, id: &str) -> PathBuf {
    dir.join(".creavia").join(format!("{id}.done"))
}

fn dir_bytes(p: &Path) -> u64 {
    let Ok(rd) = std::fs::read_dir(p) else { return 0 };
    rd.flatten()
        .map(|e| {
            let Ok(md) = e.metadata() else { return 0 };
            if md.is_dir() {
                dir_bytes(&e.path())
            } else {
                md.len()
            }
        })
        .sum()
}

#[derive(Serialize)]
pub struct ModelState {
    id: String,
    installed: bool,
    bytes: u64,
    complete: bool,
    path: String,
    downloading: bool,
}

#[tauri::command]
pub fn models_catalog() -> Vec<Entry> {
    catalog()
        .into_iter()
        .map(|m| {
            let repos =
                m.sources.iter().map(|s| s.hf.clone().unwrap_or_else(|| s.url.clone().unwrap_or_default())).collect();
            Entry { m, repos }
        })
        .collect()
}

#[tauri::command]
pub fn models_state(state: State<'_, AppState>) -> Vec<ModelState> {
    let live = state.downloads.live.lock();
    catalog()
        .into_iter()
        .map(|m| {
            let dir = engine_cache(&state, &m.engine);
            let bytes = dir_bytes(&dir);
            let complete = marker(&dir, &m.id).exists();
            ModelState {
                installed: bytes > 0,
                complete,
                bytes,
                path: dir.to_string_lossy().into_owned(),
                downloading: live.contains_key(&m.id),
                id: m.id,
            }
        })
        .collect()
}

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Event {
    Plan { files: usize, bytes: u64 },
    Progress { done: u64, total: u64, file: String, rate: f64 },
    Done,
    Error { message: String },
    Cancelled,
}

struct Job {
    url: String,
    dest: PathBuf,
    size: u64,
    label: String,
    auth: bool,
    sha256: Option<String>,
}

#[derive(Deserialize)]
struct HfFile {
    rfilename: String,
    #[serde(default)]
    size: Option<u64>,
    #[serde(default)]
    lfs: Option<HfLfs>,
}
#[derive(Deserialize)]
struct HfLfs {
    size: u64,
    #[serde(default)]
    sha256: Option<String>,
}
#[derive(Deserialize)]
struct HfInfo {
    sha: String,
    siblings: Vec<HfFile>,
}

async fn plan(state: &AppState, m: &Model, dir: &Path) -> Result<(Vec<Job>, Vec<(PathBuf, String)>), String> {
    let token = state.store.secret("hf_token");
    let mut jobs = vec![];
    let mut refs = vec![];
    for s in &m.sources {
        if let Some(repo) = &s.hf {
            let mut rb =
                state.net.client.get(format!("https://huggingface.co/api/models/{repo}/revision/main?blobs=true"));
            if let Some(t) = &token {
                rb = rb.bearer_auth(t);
            }
            let mut res =
                rb.send().await.map_err(|e| format!("Couldn't reach Hugging Face: {}", crate::net::why(&e)))?;
            for wait in [5u64, 15, 30] {
                // busy: wait and ask again, rather than ask the person for a token
                if res.status().as_u16() != 429 {
                    break;
                }
                tokio::time::sleep(Duration::from_secs(wait)).await;
                let mut rb =
                    state.net.client.get(format!("https://huggingface.co/api/models/{repo}/revision/main?blobs=true"));
                if let Some(t) = &token {
                    rb = rb.bearer_auth(t);
                }
                res = rb.send().await.map_err(|e| format!("Couldn't reach Hugging Face: {}", crate::net::why(&e)))?;
            }
            match res.status().as_u16() {
                200 => {}
                429 => return Err("Hugging Face is busy right now. Press Resume in a minute: nothing downloaded is lost".into()),
                401 | 403 => return Err(format!("{repo}'s maker now asks people to accept its terms first. Accept them on huggingface.co/{repo}, then add a token under Models → Advanced")),
                404 => return Err(format!("{repo} isn't on Hugging Face any more")),
                c => return Err(format!("Hugging Face answered {c} for {repo}")),
            }
            let info: HfInfo = res.json().await.map_err(|e| e.to_string())?;
            let repo_dir = dir.join("hub").join(format!("models--{}", repo.replace('/', "--")));
            let snap = repo_dir.join("snapshots").join(&info.sha);
            for f in info.siblings {
                let n = f.rfilename.as_str();
                if IGNORE.iter().any(|x| n.ends_with(x)) || n.starts_with("original/") {
                    continue;
                }
                let (size, sha256) = match f.lfs {
                    Some(l) => (l.size, l.sha256),
                    None => (f.size.unwrap_or(0), None),
                };
                jobs.push(Job {
                    url: format!("https://huggingface.co/{repo}/resolve/{}/{}", info.sha, n),
                    dest: snap.join(n),
                    size,
                    label: n.to_string(),
                    auth: true,
                    sha256,
                });
            }
            refs.push((repo_dir.join("refs").join("main"), info.sha));
        } else if let (Some(url), Some(to)) = (&s.url, &s.to) {
            let size = state.net.client.head(url).send().await.ok().and_then(|r| r.content_length()).unwrap_or(0);
            jobs.push(Job { url: url.clone(), dest: dir.join(to), size, label: to.clone(), auth: false, sha256: None });
        }
    }
    Ok((jobs, refs))
}

/// The file's SHA-256, read off the disk without blocking the app.
async fn sha256_of(p: PathBuf) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use sha2::{Digest, Sha256};
        use std::io::Read;
        let mut f = std::fs::File::open(&p).map_err(|e| e.to_string())?;
        let mut h = Sha256::new();
        let mut buf = vec![0u8; 1 << 20];
        loop {
            let n = f.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            h.update(&buf[..n]);
        }
        Ok(hex::encode(h.finalize()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// One file, checked: a fresh download whose SHA-256 doesn't match its maker's is thrown away and fetched once more.
async fn fetch_one(state: &AppState, j: &Job, done: &AtomicU64, stop: &AtomicBool) -> Result<(), String> {
    let existed = tokio::fs::metadata(&j.dest).await.is_ok();
    for attempt in 0..2 {
        fetch_raw(state, j, done, stop).await?;
        let Some(want) = &j.sha256 else { return Ok(()) };
        if existed && attempt == 0 {
            return Ok(());
        } // checked when it was downloaded
        if sha256_of(j.dest.clone()).await?.eq_ignore_ascii_case(want) {
            return Ok(());
        }
        log::warn!("{}: checksum mismatch, fetching again", j.label);
        let _ = tokio::fs::remove_file(&j.dest).await;
        done.fetch_sub(j.size.min(done.load(Ordering::Relaxed)), Ordering::Relaxed);
    }
    Err(format!("{} arrived damaged twice. Check your connection, then press Resume", j.label))
}

async fn fetch_raw(state: &AppState, j: &Job, done: &AtomicU64, stop: &AtomicBool) -> Result<(), String> {
    if let Ok(md) = tokio::fs::metadata(&j.dest).await {
        if j.size == 0 || md.len() == j.size {
            done.fetch_add(md.len(), Ordering::Relaxed);
            return Ok(());
        }
    }
    if let Some(p) = j.dest.parent() {
        tokio::fs::create_dir_all(p).await.map_err(|e| e.to_string())?;
    }
    let part = j.dest.with_file_name(format!("{}.part", j.dest.file_name().unwrap().to_string_lossy()));
    let mut have = tokio::fs::metadata(&part).await.map(|m| m.len()).unwrap_or(0);
    if j.size > 0 && have > j.size {
        have = 0;
        let _ = tokio::fs::remove_file(&part).await;
    }
    done.fetch_add(have, Ordering::Relaxed);
    let mut tries = 0;
    loop {
        let mut rb = state.net.client.get(&j.url).timeout(Duration::from_secs(60 * 60 * 6));
        if j.auth {
            if let Some(t) = state.store.secret("hf_token") {
                rb = rb.bearer_auth(t);
            }
        }
        if have > 0 {
            rb = rb.header(reqwest::header::RANGE, format!("bytes={have}-"));
        }
        let attempt: Result<(), String> = async {
            let res = rb.send().await.map_err(|e| crate::net::why(&e))?;
            let code = res.status().as_u16();
            if code == 416 { return Ok(()); } // already whole
            if code == 429 || code >= 500 { return Err(format!("busy ({code})")); } // retried below
            if code == 401 || code == 403 { return Err(format!("{} is gated by its maker: accept its terms on Hugging Face, then add a token under Models → Advanced", j.label)); }
            if !(200..300).contains(&code) { return Err(format!("HTTP {code} for {}", j.label)); }
            if code == 200 && have > 0 { done.fetch_sub(have, Ordering::Relaxed); have = 0; } // no ranges: from the start
            let mut f = tokio::fs::OpenOptions::new().create(true).append(have > 0).write(true).truncate(have == 0).open(&part).await.map_err(|e| e.to_string())?;
            let mut s = res.bytes_stream();
            while let Some(c) = s.next().await {
                if stop.load(Ordering::Relaxed) { return Err("cancelled".into()); }
                let c = c.map_err(|e| crate::net::why(&e))?;
                f.write_all(&c).await.map_err(|e| e.to_string())?;
                have += c.len() as u64;
                done.fetch_add(c.len() as u64, Ordering::Relaxed);
            }
            f.flush().await.map_err(|e| e.to_string())?;
            Ok(())
        }.await;
        match attempt {
            Ok(()) => break,
            Err(e) if e == "cancelled" => return Err(e),
            Err(e) if tries < 8 && !e.contains("gated") => {
                tries += 1;
                log::warn!("{}: {e}; retrying", j.label);
                tokio::time::sleep(Duration::from_secs(2u64.pow(tries.min(5)))).await;
            }
            Err(e) => return Err(e),
        }
    }
    tokio::fs::rename(&part, &j.dest).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn model_download(id: String, on_event: Channel<Event>, state: State<'_, AppState>) -> Result<(), String> {
    download(state.inner().clone(), id, Arc::new(move |e| on_event.send(e).is_ok())).await
}

pub type OnEvent = Arc<dyn Fn(Event) -> bool + Send + Sync>;

pub async fn download(state: AppState, id: String, on_event: OnEvent) -> Result<(), String> {
    let state = &state;
    let m = catalog().into_iter().find(|m| m.id == id).ok_or("no such model")?;
    let stop = Arc::new(AtomicBool::new(false));
    {
        let mut live = state.downloads.live.lock();
        if live.contains_key(&id) {
            return Err("already downloading".into());
        }
        live.insert(id.clone(), stop.clone());
    }
    let dir = engine_cache(state, &m.engine);
    let result: Result<(), String> = async {
        let (jobs, refs) = plan(state, &m, &dir).await?;
        let total: u64 = jobs.iter().map(|j| j.size).sum();
        let free = crate::sys::free_bytes(&dir);
        let have = dir_bytes(&dir);
        if free > 0 && total > have && total - have + 2_000_000_000 > free {
            return Err(format!(
                "Not enough disk: needs {:.1} GB, {:.1} GB free. Move the models folder in Settings.",
                (total - have) as f64 / 1e9,
                free as f64 / 1e9
            ));
        }
        on_event(Event::Plan { files: jobs.len(), bytes: total });
        let done = Arc::new(AtomicU64::new(0));
        let ticker = {
            let (done, stop, ch) = (done.clone(), stop.clone(), on_event.clone());
            let label = m.name.clone();
            tokio::spawn(async move {
                let (mut last, mut at) = (0u64, Instant::now());
                let mut rate = 0.0f64;
                loop {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }
                    let d = done.load(Ordering::Relaxed);
                    let dt = at.elapsed().as_secs_f64().max(0.001);
                    let now = (d.saturating_sub(last)) as f64 / dt;
                    rate = if rate == 0.0 { now } else { rate * 0.8 + now * 0.2 };
                    last = d;
                    at = Instant::now();
                    if !ch(Event::Progress { done: d, total, file: label.clone(), rate }) {
                        break;
                    }
                }
            })
        };
        let st: AppState = state.clone();
        let (done_f, stop_f) = (done.clone(), stop.clone());
        let results: Vec<Result<(), String>> = stream::iter(jobs)
            .map(move |j| {
                let (st, done, stop) = (st.clone(), done_f.clone(), stop_f.clone());
                async move { fetch_one(&st, &j, &done, &stop).await }
            })
            .buffer_unordered(4)
            .collect()
            .await;
        stop.store(true, Ordering::Relaxed);
        let _ = ticker.await;
        if let Some(e) = results.into_iter().find_map(|r| r.err()) {
            return Err(e);
        }
        for (path, sha) in refs {
            if let Some(p) = path.parent() {
                tokio::fs::create_dir_all(p).await.map_err(|e| e.to_string())?;
            }
            tokio::fs::write(&path, sha).await.map_err(|e| e.to_string())?;
        }
        let mk = marker(&dir, &m.id);
        if let Some(p) = mk.parent() {
            tokio::fs::create_dir_all(p).await.map_err(|e| e.to_string())?;
        }
        tokio::fs::write(&mk, total.to_string()).await.map_err(|e| e.to_string())?;
        Ok(())
    }
    .await;
    let cancelled = state.downloads.live.lock().remove(&id).map(|s| s.load(Ordering::Relaxed)).unwrap_or(false);
    match result {
        Ok(()) => {
            on_event(Event::Done);
            Ok(())
        }
        Err(e) if e == "cancelled" || (cancelled && e.contains("cancel")) => {
            on_event(Event::Cancelled);
            Ok(())
        }
        Err(e) => {
            on_event(Event::Error { message: e.clone() });
            Err(e)
        }
    }
}

#[tauri::command]
pub fn model_cancel(id: String, state: State<'_, AppState>) {
    if let Some(s) = state.downloads.live.lock().get(&id) {
        s.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub async fn model_delete(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let m = catalog().into_iter().find(|m| m.id == id).ok_or("no such model")?;
    if state.downloads.live.lock().contains_key(&id) {
        return Err("cancel the download first".into());
    }
    let dir = engine_cache(&state, &m.engine);
    if dir.exists() {
        tokio::fs::remove_dir_all(&dir).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}
