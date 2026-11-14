//! Creavia's local MCP server: http://127.0.0.1:<port>/mcp (Streamable HTTP, JSON answers), for Claude Desktop, Claude
//! Code, Cursor, VS Code, Gemini CLI and any other MCP client on this computer.
//!  - Only this computer can reach it (bound to 127.0.0.1), every call needs its token, and a browser page can't ride
//!    it (requests with a foreign Origin are refused).
//!  - Its own tools (`local_*`) drive the engine on this computer: voices, any engine job, jobs' results as files.
//!  - When the app is connected to your Creavia Cloud, every tool of the hosted MCP is offered too, forwarded with a key
//!    the app made for itself (a model key, revocable in the studio's Settings → Automation).
use crate::{engine, models, net, store, AppState};
use axum::{
    extract::{Query, State as AxState},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::{json, Value};
use std::{collections::HashMap, time::{Duration, Instant}};
use tauri::State;
use tokio::sync::oneshot;

#[derive(Default)]
pub struct Mcp {
    stop: Mutex<Option<oneshot::Sender<()>>>,
    port: Mutex<u16>,
    cloud_session: Mutex<Option<String>>,
    cloud_tools: Mutex<Option<(Instant, Vec<Value>)>>,
}

#[derive(Serialize)]
pub struct McpStatus { running: bool, port: u16, url: String, token: String, tools: usize, hosted_url: Option<String> }

pub fn token(state: &AppState) -> String {
    state.store.secret("mcp_token").unwrap_or_else(|| {
        let t = store::token("crv_mcp_");
        state.store.set_secret("mcp_token", Some(&t));
        t
    })
}

fn status(state: &AppState) -> McpStatus {
    let port = { let p = *state.mcp.port.lock(); if p == 0 { state.store.settings().mcp_port } else { p } };
    McpStatus {
        running: state.mcp.stop.lock().is_some(), port, url: format!("http://127.0.0.1:{port}/mcp"), token: token(state),
        tools: local_tools().len() + state.mcp.cloud_tools.lock().as_ref().map(|t| t.1.len()).unwrap_or(0),
        hosted_url: state.store.settings().cloud_url.map(|u| format!("{u}/api/mcp")),
    }
}

// ── tools on this computer ───────────────────────────────────────────────────────────────────────────────────────

fn local_tools() -> Vec<Value> {
    let obj = |props: Value, req: &[&str]| json!({ "type": "object", "properties": props, "required": req, "additionalProperties": true });
    vec![
        json!({ "name": "local_status", "description": "What this computer's Creavia can do right now: the engine (running or not), the GPU, the models downloaded, and whether the app is connected to a Creavia Cloud.", "inputSchema": obj(json!({}), &[]) }),
        json!({ "name": "local_models", "description": "Every model Creavia can run here, with what's downloaded. Models are never bundled: the person downloads the ones they want in the app (Models page).", "inputSchema": obj(json!({}), &[]) }),
        json!({ "name": "local_voices", "description": "The voices each engine on this computer offers (presets, recorded references).", "inputSchema": obj(json!({}), &[]) }),
        json!({ "name": "local_voice", "description": "Voice a script on this computer's engine. Example: {\"engine\":\"kokoro\",\"voice\":\"af_heart\",\"text\":\"Hello there. This is Creavia.\"}. Long text is split at sentences. Returns a job id: follow it with local_get_job. Engines: kokoro (CPU, instant), chatterbox, qwen, orpheus, cosyvoice (NVIDIA GPU). The engine's weights must be downloaded (local_models).",
            "inputSchema": obj(json!({ "engine": { "type": "string" }, "voice": { "type": "string" }, "text": { "type": "string", "description": "the script; or give lines" },
                "lines": { "type": "array", "items": { "type": "object", "properties": { "id": { "type": "string" }, "text": { "type": "string" } }, "required": ["text"] } },
                "platform": { "type": "string", "description": "youtube | shorts | reels | tiktok | podcast: masters loudness for it" } }), &["engine"]) }),
        json!({ "name": "local_job", "description": "Run any engine job on this computer (docs/API.md lists them): transcribe, clean, revoice, image, video, reference, fetch… Example: {\"kind\":\"image\",\"prompt\":\"a cozy desk at night, film photo\",\"model\":\"zimage\"}. Returns a job id for local_get_job.",
            "inputSchema": obj(json!({ "kind": { "type": "string" } }), &["kind"]) }),
        json!({ "name": "local_get_job", "description": "A job's progress and, once done, its results with the files on this computer. Waits up to 45 s for it to finish.", "inputSchema": obj(json!({ "id": { "type": "string" } }), &["id"]) }),
        json!({ "name": "local_cancel_job", "description": "Stop a job on this computer.", "inputSchema": obj(json!({ "id": { "type": "string" } }), &["id"]) }),
    ]
}

fn text(v: impl Into<String>) -> Value { json!({ "content": [{ "type": "text", "text": v.into() }] }) }
fn fail(v: impl Into<String>) -> Value { json!({ "content": [{ "type": "text", "text": v.into() }], "isError": true }) }

async fn engine_call(state: &AppState, method: reqwest::Method, path: &str, body: Option<Value>) -> Result<Value, String> {
    let (base, key) = engine::endpoint(state).ok_or("The engine on this computer isn't running: start it in Creavia (This computer → Engine)")?;
    let mut rb = state.net.client.request(method, format!("{base}{path}")).bearer_auth(key).timeout(Duration::from_secs(60));
    if let Some(b) = body { rb = rb.json(&b); }
    let res = rb.send().await.map_err(|e| e.to_string())?;
    let code = res.status();
    let v: Value = res.json().await.unwrap_or(Value::Null);
    if !code.is_success() { return Err(v.get("error").and_then(|e| e.as_str()).map(String::from).unwrap_or_else(|| format!("engine answered {code}"))); }
    Ok(v)
}

async fn call_local(state: &AppState, name: &str, args: Value) -> Value {
    let r: Result<Value, String> = async {
        match name {
            "local_status" => {
                let installed: Vec<String> = models::catalog().into_iter().filter(|m| models::engine_cache(state, &m.engine).exists()).map(|m| m.id).collect();
                let health = engine_call(state, reqwest::Method::GET, "/health", None).await.ok();
                Ok(text(serde_json::to_string_pretty(&json!({ "engine": health.map(|_| "running").unwrap_or("stopped"), "models_downloaded": installed,
                    "cloud": net::connection(&state.store) })).unwrap()))
            }
            "local_models" => {
                let all: Vec<Value> = models::catalog().into_iter().map(|m| {
                    let have = models::engine_cache(state, &m.engine).exists();
                    json!({ "id": m.id, "name": m.name, "kind": m.kind, "downloaded": have, "disk_gb": m.disk_gb, "vram_gb": m.vram_gb, "license": m.license, "about": m.about })
                }).collect();
                Ok(text(serde_json::to_string_pretty(&all).unwrap()))
            }
            "local_voices" => Ok(text(engine_call(state, reqwest::Method::GET, "/voices", None).await?.to_string())),
            "local_voice" => {
                let mut b = args.clone();
                if b.get("lines").is_none() {
                    let t = b.get("text").and_then(|t| t.as_str()).ok_or("give text or lines")?.to_string();
                    b["lines"] = json!([{ "id": "01", "text": t }]);
                }
                if let Some(o) = b.as_object_mut() { o.remove("text"); o.remove("kind"); }
                let j = engine_call(state, reqwest::Method::POST, "/jobs", Some(b)).await?;
                Ok(text(format!("Started job {} (follow it with local_get_job).", j.get("id").and_then(|i| i.as_str()).unwrap_or("?"))))
            }
            "local_job" => {
                let j = engine_call(state, reqwest::Method::POST, "/jobs", Some(args.clone())).await?;
                Ok(text(format!("Started job {} (follow it with local_get_job).", j.get("id").and_then(|i| i.as_str()).unwrap_or("?"))))
            }
            "local_get_job" => {
                let id = args.get("id").and_then(|i| i.as_str()).filter(|i| i.len() == 12 && i.chars().all(|c| c.is_ascii_hexdigit())).ok_or("id: the 12-character job id")?;
                let until = Instant::now() + Duration::from_secs(45);
                loop {
                    let j = engine_call(state, reqwest::Method::GET, &format!("/jobs/{id}"), None).await?;
                    let s = j.get("status").and_then(|s| s.as_str()).unwrap_or("");
                    if matches!(s, "done" | "failed" | "error" | "cancelled") || Instant::now() > until {
                        let folder = store::engine_home(&state.store.settings()).join("jobs").join(id);
                        return Ok(text(serde_json::to_string_pretty(&json!({ "job": j, "files_folder": folder })).unwrap()));
                    }
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
            "local_cancel_job" => {
                let id = args.get("id").and_then(|i| i.as_str()).unwrap_or("");
                Ok(text(engine_call(state, reqwest::Method::POST, &format!("/jobs/{id}/cancel"), Some(json!({}))).await?.to_string()))
            }
            _ => Err(format!("no tool called {name}")),
        }
    }.await;
    r.unwrap_or_else(fail)
}

// ── the hosted MCP, forwarded ────────────────────────────────────────────────────────────────────────────────────

/// The key this app uses on the hosted MCP: the access token it signed in with, or a model key it made for itself.
async fn cloud_key(state: &AppState) -> Option<String> {
    if let Some(t) = state.store.secret("cloud_token") { return Some(t); }
    if let Some(k) = state.store.secret("cloud_mcp_key") { return Some(k); }
    state.store.secret("cloud_cookie")?; // signed in with a cookie: make a key below; otherwise there is none
    let rb = net::cloud_request(state, reqwest::Method::POST, "/api/dash/automation/keys").ok()?;
    let v: Value = rb.json(&json!({ "name": "Creavia desktop" })).send().await.ok()?.json().await.ok()?;
    let k = v.get("key")?.as_str()?.to_string();
    state.store.set_secret("cloud_mcp_key", Some(&k));
    Some(k)
}

async fn cloud_rpc(state: &AppState, body: Value) -> Result<Value, String> {
    let base = state.store.settings().cloud_url.ok_or("not connected")?;
    let key = cloud_key(state).await.ok_or("not connected")?;
    for attempt in 0..2 {
        let session = state.mcp.cloud_session.lock().clone();
        let mut rb = state.net.client.post(format!("{base}/api/mcp")).bearer_auth(&key)
            .header("Accept", "application/json, text/event-stream").header("MCP-Protocol-Version", "2025-06-18").json(&body);
        if let Some(s) = &session { rb = rb.header("Mcp-Session-Id", s); }
        let res = rb.send().await.map_err(|e| e.to_string())?;
        if let Some(s) = res.headers().get("mcp-session-id").and_then(|v| v.to_str().ok()) { *state.mcp.cloud_session.lock() = Some(s.to_string()); }
        let code = res.status().as_u16();
        if code == 401 && state.store.secret("cloud_mcp_key").is_some() && attempt == 0 {
            state.store.set_secret("cloud_mcp_key", None); // revoked in the studio: make a new one once
            return Box::pin(cloud_rpc(state, body)).await;
        }
        if (code == 400 || code == 404) && session.is_some() && attempt == 0 { *state.mcp.cloud_session.lock() = None; continue; }
        let ctype = res.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        let raw = res.text().await.map_err(|e| e.to_string())?;
        if code >= 400 { return Err(format!("the studio's MCP answered {code}")); }
        if ctype.contains("event-stream") {
            let last = raw.lines().filter_map(|l| l.strip_prefix("data:")).map(str::trim).filter(|l| !l.is_empty())
                .filter_map(|l| serde_json::from_str::<Value>(l).ok()).rfind(|v| v.get("id").is_some()); // the last message with an id is the answer
            return last.ok_or_else(|| "empty answer from the studio's MCP".into());
        }
        return serde_json::from_str(&raw).map_err(|e| e.to_string());
    }
    Err("the studio's MCP didn't answer".into())
}

async fn ensure_cloud_session(state: &AppState) {
    if state.mcp.cloud_session.lock().is_some() { return; }
    let init = json!({ "jsonrpc": "2.0", "id": "creavia-init", "method": "initialize", "params": { "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "creavia-desktop", "version": env!("CARGO_PKG_VERSION") } } });
    if cloud_rpc(state, init).await.is_ok() {
        let _ = cloud_rpc_notify(state).await;
    }
}

async fn cloud_rpc_notify(state: &AppState) -> Result<(), String> {
    let base = state.store.settings().cloud_url.ok_or("not connected")?;
    let key = cloud_key(state).await.ok_or("not connected")?;
    let mut rb = state.net.client.post(format!("{base}/api/mcp")).bearer_auth(key).header("Accept", "application/json, text/event-stream")
        .json(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }));
    if let Some(s) = state.mcp.cloud_session.lock().clone() { rb = rb.header("Mcp-Session-Id", s); }
    rb.send().await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn cloud_tools(state: &AppState) -> Vec<Value> {
    if let Some((at, t)) = state.mcp.cloud_tools.lock().as_ref() { if at.elapsed() < Duration::from_secs(300) { return t.clone(); } }
    if net::connection(&state.store).url.is_none() { return vec![]; }
    ensure_cloud_session(state).await;
    let tools = cloud_rpc(state, json!({ "jsonrpc": "2.0", "id": "creavia-tools", "method": "tools/list", "params": {} })).await.ok()
        .and_then(|v| v.pointer("/result/tools").and_then(|t| t.as_array()).cloned()).unwrap_or_default();
    *state.mcp.cloud_tools.lock() = Some((Instant::now(), tools.clone()));
    tools
}

// ── JSON-RPC ─────────────────────────────────────────────────────────────────────────────────────────────────────

const INSTRUCTIONS: &str = "Creavia: a creator studio. Tools named local_* run on this computer's engine (models the person downloaded in the app). The other tools are the person's Creavia Cloud (posts, files, voices, publishing, analytics), when the app is connected to one. Long jobs return an id: follow it with local_get_job (local) or get_job (cloud).";

async fn handle_one(state: &AppState, msg: Value) -> Option<Value> {
    let id = msg.get("id").cloned();
    let method = msg.get("method").and_then(|m| m.as_str()).unwrap_or("");
    let params = msg.get("params").cloned().unwrap_or(json!({}));
    let id = id?; // a notification: nothing to answer
    let result: Result<Value, (i64, String)> = match method {
        "initialize" => Ok(json!({
            "protocolVersion": params.get("protocolVersion").and_then(|v| v.as_str()).unwrap_or("2025-06-18"),
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "Creavia", "version": env!("CARGO_PKG_VERSION") },
            "instructions": INSTRUCTIONS,
        })),
        "ping" => Ok(json!({})),
        "tools/list" => {
            let mut tools = local_tools();
            tools.extend(cloud_tools(state).await);
            Ok(json!({ "tools": tools }))
        }
        "tools/call" => {
            let name = params.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
            let args = params.get("arguments").cloned().unwrap_or(json!({}));
            if name.starts_with("local_") { Ok(call_local(state, &name, args).await) }
            else {
                ensure_cloud_session(state).await;
                match cloud_rpc(state, json!({ "jsonrpc": "2.0", "id": id.clone(), "method": "tools/call", "params": { "name": name, "arguments": args } })).await {
                    Ok(v) => match (v.get("result"), v.get("error")) {
                        (Some(r), _) => Ok(r.clone()),
                        (_, Some(e)) => Err((e.get("code").and_then(|c| c.as_i64()).unwrap_or(-32000), e.get("message").and_then(|m| m.as_str()).unwrap_or("error").into())),
                        _ => Ok(fail("empty answer")),
                    },
                    Err(e) => Ok(fail(format!("{name}: {e}. Connect Creavia to your studio to use the hosted tools."))),
                }
            }
        }
        "resources/list" => Ok(json!({ "resources": [] })),
        "prompts/list" => Ok(json!({ "prompts": [] })),
        _ => Err((-32601, format!("no method {method}"))),
    };
    Some(match result {
        Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
        Err((code, message)) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }),
    })
}

fn authorized(state: &AppState, headers: &HeaderMap, q: &HashMap<String, String>) -> bool {
    if let Some(o) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        let ok = url::Url::parse(o).ok().and_then(|u| u.host_str().map(|h| matches!(h, "localhost" | "127.0.0.1" | "[::1]"))).unwrap_or(false);
        if !ok { return false; }
    }
    let want = token(state);
    let got = headers.get("authorization").and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer ").or(v.strip_prefix("bearer ")))
        .map(str::to_string).or_else(|| q.get("key").cloned()).unwrap_or_default();
    got.len() == want.len() && got.bytes().zip(want.bytes()).fold(0u8, |a, (x, y)| a | (x ^ y)) == 0
}

async fn rpc(AxState(state): AxState<AppState>, Query(q): Query<HashMap<String, String>>, headers: HeaderMap, Json(body): Json<Value>) -> Response {
    if !authorized(&state, &headers, &q) {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Creavia's MCP needs its token: copy the settings from the app (MCP page)" }))).into_response();
    }
    if let Some(batch) = body.as_array() {
        let mut out = vec![];
        for m in batch.clone() { if let Some(r) = handle_one(&state, m).await { out.push(r); } }
        return if out.is_empty() { StatusCode::ACCEPTED.into_response() } else { Json(Value::Array(out)).into_response() };
    }
    match handle_one(&state, body).await {
        Some(r) => Json(r).into_response(),
        None => StatusCode::ACCEPTED.into_response(),
    }
}

pub async fn start(state: AppState, port: u16) -> Result<(), String> {
    if state.mcp.stop.lock().is_some() { return Ok(()); }
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await.map_err(|e| format!("Port {port} is busy: {e}"))?;
    let (tx, rx) = oneshot::channel::<()>();
    let app = Router::new()
        .route("/mcp", post(rpc).get(|| async { (StatusCode::METHOD_NOT_ALLOWED, "POST JSON-RPC here") }))
        .route("/health", get(|| async { "ok" }))
        .with_state(state.clone());
    *state.mcp.stop.lock() = Some(tx);
    *state.mcp.port.lock() = port;
    let st = state.clone();
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, app).with_graceful_shutdown(async { let _ = rx.await; }).await;
        *st.mcp.stop.lock() = None;
    });
    Ok(())
}

#[tauri::command]
pub fn mcp_status(state: State<'_, AppState>) -> McpStatus { status(&state) }

#[tauri::command]
pub async fn mcp_start(port: Option<u16>, state: State<'_, AppState>) -> Result<McpStatus, String> {
    let port = port.unwrap_or_else(|| state.store.settings().mcp_port);
    start(state.inner().clone(), port).await?;
    state.store.update(|s| { s.mcp_port = port; s.mcp_autostart = true; });
    let st = state.inner().clone();
    tauri::async_runtime::spawn(async move { cloud_tools(&st).await; }); // warm the hosted tool list
    Ok(status(&state))
}

#[tauri::command]
pub fn mcp_stop(state: State<'_, AppState>) -> McpStatus {
    if let Some(tx) = state.mcp.stop.lock().take() { let _ = tx.send(()); }
    state.store.update(|s| s.mcp_autostart = false);
    status(&state)
}

#[tauri::command]
pub fn mcp_rotate(state: State<'_, AppState>) -> McpStatus {
    state.store.set_secret("mcp_token", Some(&store::token("crv_mcp_")));
    status(&state)
}
