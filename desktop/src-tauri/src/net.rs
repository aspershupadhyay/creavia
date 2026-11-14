//! Your Creavia Cloud, from the desktop. Rust holds the sign-in (the studio's session cookie, or an access token) and
//! makes every request the screens make, so:
//!  - the web view never sees a cookie or a key;
//!  - there is no CORS (the cloud's same-origin check passes: these requests carry no Origin, like a script's);
//!  - media streams by byte ranges through the `cloud://` scheme.
use crate::store::Store;
use crate::AppState;
use futures_util::StreamExt;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap},
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use tauri::{
    http::{self, header},
    ipc::{Channel, InvokeBody, Request as IpcRequest, Response as IpcResponse},
    State,
};

/// An error with its causes ("error sending request: connection refused"), for messages people can act on.
pub fn why(e: &dyn std::error::Error) -> String {
    let mut s = e.to_string();
    let mut src = e.source();
    while let Some(c) = src { let m = c.to_string(); if !s.contains(&m) { s.push_str(": "); s.push_str(&m); } src = c.source(); }
    s
}

pub struct Net {
    pub client: reqwest::Client,
    staged: Mutex<HashMap<u64, Vec<u8>>>,
    next: AtomicU64,
}

impl Net {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(concat!("Creavia/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(330)) // the studio's longest calls run 300 s (a GPU booting)
            .pool_max_idle_per_host(16)
            .build()
            .expect("http client");
        Self { client, staged: Mutex::new(HashMap::new()), next: AtomicU64::new(1) }
    }
}

#[derive(Serialize, Clone)]
pub struct Connection { pub mode: &'static str, pub url: Option<String>, pub how: Option<String>, pub who: Option<String> }

/// Studios Creavia must never connect to. The live VoiceBox (aspershupadhyay/voicebox-gpu) is the owner's working
/// studio: Creavia is built and tested apart from it, so nothing done here can write to it or break it (docs/FEEDBACK.md,
/// 2026-11-14). Matched on the host, including subdomains.
const PROTECTED_HOSTS: &[&str] = &["voiceboxstudio.pages.dev"];

pub fn is_protected(url: &str) -> bool {
    let Ok(u) = url::Url::parse(url) else { return false };
    let Some(host) = u.host_str().map(|h| h.trim_end_matches('.').to_ascii_lowercase()) else { return false };
    PROTECTED_HOSTS.iter().any(|p| host == *p || host.ends_with(&format!(".{p}")))
}

const PROTECTED_MESSAGE: &str = "That's the live VoiceBox studio. Creavia keeps away from it so it can't break; use a Creavia Cloud instead.";

pub fn connection(store: &Store) -> Connection {
    let s = store.settings();
    // an older connection to a protected studio counts as no connection
    if s.cloud_url.as_deref().is_some_and(is_protected) { return Connection { mode: "none", url: None, how: None, who: None }; }
    let connected = s.cloud_url.is_some() && (store.secret("cloud_cookie").is_some() || store.secret("cloud_token").is_some());
    Connection { mode: if connected { "cloud" } else { "none" }, url: s.cloud_url, how: s.cloud_how, who: s.cloud_who }
}

/// "studio.example.com" or "https://studio.example.com/" → "https://studio.example.com"
pub fn normalize_url(raw: &str) -> Result<String, String> {
    let t = raw.trim().trim_end_matches('/');
    // the scheme in any case ("HTTPS://…" once became "https://https")
    let lower = t.to_ascii_lowercase();
    let with = if lower.starts_with("http://") || lower.starts_with("https://") { t.to_string() } else { format!("https://{t}") };
    let u = url::Url::parse(&with).map_err(|_| "That doesn't look like a web address".to_string())?;
    let local = matches!(u.host_str(), Some("localhost") | Some("127.0.0.1"));
    if u.scheme() != "https" && !local { return Err("Use an https:// address (http only for localhost)".into()); }
    if is_protected(&with) { return Err(PROTECTED_MESSAGE.into()); }
    Ok(format!("{}://{}", u.scheme(), u.host_str().unwrap_or("")) + &u.port().map(|p| format!(":{p}")).unwrap_or_default())
}

// ── cookies ──────────────────────────────────────────────────────────────────────────────────────────────────────

fn parse_jar(s: &str) -> BTreeMap<String, String> {
    s.split("; ").filter_map(|kv| kv.split_once('=')).map(|(k, v)| (k.to_string(), v.to_string())).collect()
}

fn jar_string(m: &BTreeMap<String, String>) -> String {
    m.iter().map(|(k, v)| format!("{k}={v}")).collect::<Vec<_>>().join("; ")
}

/// Keep the cookies the studio sets (its session), drop the ones it clears.
fn absorb_cookies(store: &Store, headers: &reqwest::header::HeaderMap) {
    let set: Vec<_> = headers.get_all(reqwest::header::SET_COOKIE).iter().filter_map(|v| v.to_str().ok()).collect();
    if set.is_empty() { return; }
    let mut jar = parse_jar(&store.secret("cloud_cookie").unwrap_or_default());
    for c in set {
        let mut parts = c.split(';');
        let Some((name, value)) = parts.next().and_then(|kv| kv.trim().split_once('=')) else { continue };
        let gone = value.is_empty() || parts.any(|p| { let p = p.trim().to_ascii_lowercase(); p == "max-age=0" || p.starts_with("max-age=-") || p.starts_with("expires=thu, 01 jan 1970") });
        if gone { jar.remove(name); } else { jar.insert(name.to_string(), value.to_string()); }
    }
    let joined = jar_string(&jar);
    store.set_secret("cloud_cookie", if jar.is_empty() { None } else { Some(&joined) });
}

/// A request to the studio, signed in.
pub fn cloud_request(state: &AppState, method: reqwest::Method, path: &str) -> Result<reqwest::RequestBuilder, String> {
    let base = state.store.settings().cloud_url.ok_or("not connected to a studio")?;
    if is_protected(&base) { return Err(PROTECTED_MESSAGE.into()); }
    let mut rb = state.net.client.request(method, format!("{base}{path}"));
    if let Some(t) = state.store.secret("cloud_token") { rb = rb.bearer_auth(t); }
    else if let Some(c) = state.store.secret("cloud_cookie") { rb = rb.header(reqwest::header::COOKIE, c); }
    Ok(rb)
}

#[derive(Deserialize)]
pub struct Meta { method: String, url: String, #[serde(default)] headers: HashMap<String, String> }

const SKIP_REQ: &[&str] = &["host", "content-length", "connection", "cookie", "origin", "referer", "accept-encoding",
    "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "authorization"];
const SKIP_RES: &[&str] = &["set-cookie", "content-encoding", "content-length", "transfer-encoding", "connection"];

fn frame(status: u16, headers: Vec<(String, String)>, url: &str, body: &[u8]) -> IpcResponse {
    let meta = serde_json::json!({ "status": status, "headers": headers, "url": url }).to_string();
    let mut out = Vec::with_capacity(4 + meta.len() + body.len());
    out.extend_from_slice(&(meta.len() as u32).to_le_bytes());
    out.extend_from_slice(meta.as_bytes());
    out.extend_from_slice(body);
    IpcResponse::new(out)
}

fn not_connected() -> IpcResponse {
    frame(401, vec![("content-type".into(), "application/json".into())], "", br#"{"error":"unauthorized","detail":"Connect Creavia to your studio first"}"#)
}

async fn perform(state: &AppState, meta: &Meta, body: Vec<u8>, progress: Option<&Channel<f64>>) -> Result<IpcResponse, String> {
    let method = reqwest::Method::from_bytes(meta.method.as_bytes()).map_err(|_| "bad method")?;
    let cloud = meta.url.starts_with('/');
    let mut rb = if cloud {
        match cloud_request(state, method.clone(), &meta.url) { Ok(r) => r, Err(_) => return Ok(not_connected()) }
    } else {
        let u = url::Url::parse(&meta.url).map_err(|e| e.to_string())?;
        if !matches!(u.scheme(), "http" | "https") { return Err("only web addresses".into()); }
        state.net.client.request(method.clone(), u)
    };
    for (k, v) in &meta.headers {
        if !SKIP_REQ.contains(&k.to_ascii_lowercase().as_str()) { rb = rb.header(k, v); }
    }
    if !body.is_empty() || !matches!(method, reqwest::Method::GET | reqwest::Method::HEAD) {
        let total = body.len() as u64;
        if let (Some(ch), true) = (progress, total > 256 * 1024) {
            // stream the body in 256 KB pieces so the screen sees it go
            let ch = ch.clone();
            let mut sent = 0u64;
            let chunks: Vec<Vec<u8>> = body.chunks(256 * 1024).map(|c| c.to_vec()).collect();
            let stream = futures_util::stream::iter(chunks.into_iter().map(move |c| {
                sent += c.len() as u64;
                let _ = ch.send(sent as f64 / total as f64);
                Ok::<_, std::io::Error>(c)
            }));
            rb = rb.header(reqwest::header::CONTENT_LENGTH, total).body(reqwest::Body::wrap_stream(stream));
        } else {
            rb = rb.body(body);
        }
    }
    let res = rb.send().await.map_err(|e| e.to_string())?;
    if cloud { absorb_cookies(&state.store, res.headers()); }
    let status = res.status().as_u16();
    let final_url = res.url().to_string();
    let headers: Vec<(String, String)> = res.headers().iter()
        .filter(|(k, _)| !SKIP_RES.contains(&k.as_str()))
        .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string()))).collect();
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    if let Some(ch) = progress { let _ = ch.send(1.0); }
    Ok(frame(status, headers, &final_url, &bytes))
}

fn meta_from(req: &IpcRequest<'_>) -> Result<Meta, String> {
    let raw = req.headers().get("x-creavia").and_then(|v| v.to_str().ok()).ok_or("missing request meta")?;
    let json = percent_encoding::percent_decode_str(raw).decode_utf8_lossy();
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

fn raw_body(req: &IpcRequest<'_>) -> Vec<u8> {
    match req.body() { InvokeBody::Raw(b) => b.clone(), InvokeBody::Json(v) if !v.is_null() => v.to_string().into_bytes(), _ => vec![] }
}

/// One request from the screens (src/bridge/fetch.ts): meta in a header, the body raw.
#[tauri::command]
pub async fn http(request: IpcRequest<'_>, state: State<'_, AppState>) -> Result<IpcResponse, String> {
    let meta = meta_from(&request)?;
    perform(&state, &meta, raw_body(&request), None).await
}

/// Park an upload's bytes (raw), then send them with `http_send`, which reports progress.
#[tauri::command]
pub fn http_stage(request: IpcRequest<'_>, state: State<'_, AppState>) -> u64 {
    let id = state.net.next.fetch_add(1, Ordering::Relaxed);
    state.net.staged.lock().insert(id, raw_body(&request));
    id
}

#[tauri::command]
pub async fn http_send(meta: Meta, body_id: u64, on_progress: Channel<f64>, state: State<'_, AppState>) -> Result<IpcResponse, String> {
    let body = state.net.staged.lock().remove(&body_id).unwrap_or_default();
    perform(&state, &meta, body, Some(&on_progress)).await
}

// ── signing in ───────────────────────────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn cloud_get(state: State<'_, AppState>) -> Connection { connection(&state.store) }

#[tauri::command]
pub async fn cloud_login(url: String, email: String, password: String, name: Option<String>, state: State<'_, AppState>) -> Result<Connection, String> {
    let base = normalize_url(&url)?;
    // a name means a new account (the studio lets you in only when your email is on its list, or it's brand new)
    let body = match name.as_deref().map(str::trim).filter(|n| !n.is_empty()) {
        Some(n) => serde_json::json!({ "signup": { "name": n, "email": email.trim(), "password": password } }),
        None => serde_json::json!({ "email": email.trim(), "password": password }),
    };
    let res = state.net.client.post(format!("{base}/api/login"))
        .json(&body)
        .send().await.map_err(|e| format!("Couldn't reach {base}: {e}"))?;
    let status = res.status();
    let headers = res.headers().clone();
    let body: serde_json::Value = res.json().await.unwrap_or_default();
    if !status.is_success() {
        return Err(body.get("error").and_then(|e| e.as_str()).unwrap_or("Sign-in failed").to_string());
    }
    state.store.set_secret("cloud_token", None);
    state.store.set_secret("cloud_cookie", None);
    state.store.set_secret("cloud_mcp_key", None);
    state.store.update(|s| { s.cloud_url = Some(base.clone()); s.cloud_how = Some("password".into()); s.cloud_who = Some(email.trim().to_lowercase()); });
    absorb_cookies(&state.store, &headers);
    if state.store.secret("cloud_cookie").is_none() { return Err("The studio didn't start a session".into()); }
    Ok(connection(&state.store))
}

#[tauri::command]
pub async fn cloud_use_token(url: String, token: String, state: State<'_, AppState>) -> Result<Connection, String> {
    let base = normalize_url(&url)?;
    let token = token.trim().to_string();
    let res = state.net.client.get(format!("{base}/api/dash/status")).bearer_auth(&token).send().await
        .map_err(|e| format!("Couldn't reach {base}: {e}"))?;
    if res.status().as_u16() == 401 { return Err("The studio didn't accept that token".into()); }
    state.store.set_secret("cloud_cookie", None);
    state.store.set_secret("cloud_mcp_key", None);
    state.store.set_secret("cloud_token", Some(&token));
    state.store.update(|s| { s.cloud_url = Some(base.clone()); s.cloud_how = Some("token".into()); s.cloud_who = Some("access token".into()); });
    Ok(connection(&state.store))
}

#[tauri::command]
pub async fn cloud_logout(state: State<'_, AppState>) -> Result<Connection, String> {
    if state.store.secret("cloud_cookie").is_some() {
        if let Ok(rb) = cloud_request(&state, reqwest::Method::DELETE, "/api/login") { let _ = rb.send().await; }
    }
    for k in ["cloud_cookie", "cloud_token", "cloud_mcp_key"] { state.store.set_secret(k, None); }
    state.store.update(|s| { s.cloud_how = None; s.cloud_who = None; });
    Ok(connection(&state.store))
}

// ── the cloud:// scheme: media and links the web view loads by itself ────────────────────────────────────────────

const RANGE_STEP: u64 = 8 * 1024 * 1024;

pub async fn serve_scheme(state: &AppState, req: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let path = req.uri().path_and_query().map(|p| p.as_str().to_string()).unwrap_or_else(|| "/".into());
    let fail = |code: u16, msg: &str| http::Response::builder().status(code)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*").header(header::CONTENT_TYPE, "text/plain")
        .body(msg.as_bytes().to_vec()).unwrap();
    let Ok(mut rb) = cloud_request(state, reqwest::Method::GET, &path) else { return fail(401, "not connected") };
    // an open-ended range ("bytes=N-") is served in 8 MB steps: players ask for the next piece as they go
    if let Some(r) = req.headers().get(header::RANGE).and_then(|v| v.to_str().ok()) {
        let r = match r.strip_prefix("bytes=").and_then(|x| x.strip_suffix('-')).and_then(|n| n.parse::<u64>().ok()) {
            Some(start) => format!("bytes={}-{}", start, start + RANGE_STEP - 1),
            None => r.to_string(),
        };
        rb = rb.header(reqwest::header::RANGE, r);
    }
    let Ok(res) = rb.send().await else { return fail(502, "studio unreachable") };
    absorb_cookies(&state.store, res.headers());
    let mut out = http::Response::builder().status(res.status().as_u16()).header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*");
    for (k, v) in res.headers() {
        if SKIP_RES.contains(&k.as_str()) { continue; }
        out = out.header(k.as_str(), v.as_bytes());
    }
    let body = res.bytes().await.map(|b| b.to_vec()).unwrap_or_default();
    out.body(body).unwrap_or_else(|_| fail(500, "bad response"))
}

// ── downloads ────────────────────────────────────────────────────────────────────────────────────────────────────

fn filename_from(res: &reqwest::Response, url: &str, name: Option<String>) -> String {
    let from_header = res.headers().get(reqwest::header::CONTENT_DISPOSITION).and_then(|v| v.to_str().ok())
        .and_then(|cd| cd.split("filename=").nth(1)).map(|f| f.trim_matches(|c| c == '"' || c == ';' || c == ' ').to_string());
    let from_url = url.split('?').next().and_then(|p| p.rsplit('/').next()).map(|s| percent_encoding::percent_decode_str(s).decode_utf8_lossy().into_owned());
    let n = name.or(from_header).or(from_url).filter(|s| !s.is_empty()).unwrap_or_else(|| "download".into());
    n.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_")
}

fn free_path(dir: &std::path::Path, name: &str) -> PathBuf {
    let p = dir.join(name);
    if !p.exists() { return p; }
    let (stem, ext) = match name.rsplit_once('.') { Some((s, e)) => (s.to_string(), format!(".{e}")), None => (name.to_string(), String::new()) };
    (1..).map(|i| dir.join(format!("{stem} ({i}){ext}"))).find(|p| !p.exists()).unwrap()
}

/// Save a studio file (or any link) into Downloads. Returns where it went.
#[tauri::command]
pub async fn download(url: String, name: Option<String>, state: State<'_, AppState>) -> Result<String, String> {
    let rb = if url.starts_with('/') { cloud_request(&state, reqwest::Method::GET, &url)? } else { state.net.client.get(&url) };
    let res = rb.send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() { return Err(format!("HTTP {}", res.status().as_u16())); }
    let dir = dirs::download_dir().unwrap_or_else(|| dirs::home_dir().unwrap_or_default());
    let path = free_path(&dir, &filename_from(&res, &url, name));
    let tmp = path.with_extension("creavia-part");
    let mut f = tokio::fs::File::create(&tmp).await.map_err(|e| e.to_string())?;
    let mut s = res.bytes_stream();
    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = s.next().await {
        f.write_all(&chunk.map_err(|e| e.to_string())?).await.map_err(|e| e.to_string())?;
    }
    f.flush().await.map_err(|e| e.to_string())?;
    drop(f);
    tokio::fs::rename(&tmp, &path).await.map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_live_voicebox_is_refused_however_it_is_written() {
        for raw in ["voiceboxstudio.pages.dev", "https://voiceboxstudio.pages.dev/", "HTTPS://VoiceBoxStudio.Pages.Dev/home",
                    "https://voiceboxstudio.pages.dev:443", "https://abc123.voiceboxstudio.pages.dev", "https://voiceboxstudio.pages.dev./"] {
            assert_eq!(normalize_url(raw), Err(PROTECTED_MESSAGE.to_string()), "{raw} must be refused");
        }
    }

    #[test]
    fn other_studios_still_work() {
        assert_eq!(normalize_url("studio.example.com/").unwrap(), "https://studio.example.com");
        assert_eq!(normalize_url("https://creavia-cloud.someone.workers.dev").unwrap(), "https://creavia-cloud.someone.workers.dev");
        assert_eq!(normalize_url("http://localhost:3000").unwrap(), "http://localhost:3000");
        // a lookalike is not the protected host
        assert!(!is_protected("https://notvoiceboxstudio.pages.dev"));
        assert!(!is_protected("https://voiceboxstudio.pages.dev.example.com"));
    }

    #[test]
    fn the_scheme_is_read_in_any_case() {
        assert_eq!(normalize_url("HTTPS://Studio.Example.com/").unwrap(), "https://studio.example.com");
    }

    #[test]
    fn plain_http_is_only_for_this_computer() {
        assert!(normalize_url("http://studio.example.com").is_err());
        assert!(normalize_url("not a url at all").is_err());
    }
}
