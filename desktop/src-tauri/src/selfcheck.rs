//! `creavia --self-check[=full]`: proves the app's Rust side works on this machine, without a window. It prints a
//! line per check and exits non-zero on a failure (CI runs it on every platform).
//!  - always: settings and secrets, the machine, the model catalogue, the local MCP server (initialize, tools/list,
//!    tools/call local_models);
//!  - full: also downloads Kokoro (CPU, 350 MB, from GitHub), sets up the engine (uv), starts it, and voices a line
//!    through the MCP (local_voice, then local_get_job).
use crate::{engine, mcp, models, AppState};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};

fn ok(name: &str, detail: impl AsRef<str>) {
    println!("ok   {name}: {}", detail.as_ref());
}

async fn rpc(state: &AppState, port: u16, body: Value) -> Result<Value, String> {
    let res = state
        .net
        .client
        .post(format!("http://127.0.0.1:{port}/mcp"))
        .bearer_auth(mcp::token(state))
        .json(&body)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.json().await.map_err(|e| e.to_string())
}

fn tool_text(v: &Value) -> String {
    v.pointer("/result/content/0/text").and_then(|t| t.as_str()).unwrap_or_default().to_string()
}

pub async fn run(state: AppState, full: bool) -> Result<(), String> {
    ok("settings", format!("data in {}", crate::store::data_dir().display()));
    let cat = models::catalog();
    ok("catalogue", format!("{} models, none bundled", cat.len()));
    let port = 17377;
    mcp::start(state.clone(), port).await?;
    let init = rpc(
        &state,
        port,
        json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-06-18" } }),
    )
    .await?;
    ok("mcp initialize", init.pointer("/result/serverInfo/name").and_then(|v| v.as_str()).unwrap_or("?"));
    let unauth = state
        .net
        .client
        .post(format!("http://127.0.0.1:{port}/mcp"))
        .json(&json!({ "jsonrpc": "2.0", "id": 1, "method": "ping" }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if unauth.status().as_u16() != 401 {
        return Err("the MCP answered without its token".into());
    }
    ok("mcp auth", "refuses calls without the token");
    let tools = rpc(&state, port, json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" })).await?;
    let n = tools.pointer("/result/tools").and_then(|t| t.as_array()).map(|a| a.len()).unwrap_or(0);
    if n < 7 {
        return Err(format!("only {n} tools"));
    }
    ok("mcp tools/list", format!("{n} tools"));
    let m = rpc(&state, port, json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "local_models", "arguments": {} } })).await?;
    if !tool_text(&m).contains("kokoro") {
        return Err("local_models didn't list kokoro".into());
    }
    ok("mcp local_models", "lists the catalogue");
    if !full {
        return Ok(());
    }

    let last = Arc::new(parking_lot::Mutex::new(String::new()));
    let l2 = last.clone();
    models::download(
        state.clone(),
        "kokoro".into(),
        Arc::new(move |e| {
            *l2.lock() = serde_json::to_string(&e).unwrap_or_default();
            true
        }),
    )
    .await?;
    ok("download kokoro", last.lock().clone());
    let again = std::time::Instant::now();
    models::download(state.clone(), "kokoro".into(), Arc::new(|_| true)).await?;
    ok("download again", format!("already there, {:.1} s", again.elapsed().as_secs_f64()));

    let dir = engine::engine_dir_in(None).ok_or("engine files not found (set CREAVIA_ENGINE_DIR)")?;
    engine::install(&state, dir.clone(), Arc::new(|l| println!("     | {l}"))).await?;
    ok("engine install", "uv environment ready");
    engine::start(&state, dir, false, None).await?;
    ok("engine start", "answering /health");
    let started = rpc(&state, port, json!({ "jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": { "name": "local_voice",
        "arguments": { "engine": "kokoro", "voice": "af_heart", "text": "Hi, I'm Vee. Creavia is working on this computer." } } })).await?;
    let t = tool_text(&started);
    let id: String =
        t.split_whitespace().nth(2).unwrap_or_default().chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if id.len() != 12 {
        engine::stop(&state);
        return Err(format!("local_voice: {t}"));
    }
    ok("mcp local_voice", format!("job {id}"));
    let mut status = String::new();
    for _ in 0..12 {
        let j = rpc(&state, port, json!({ "jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": { "name": "local_get_job", "arguments": { "id": id } } })).await?;
        let v: Value = serde_json::from_str(&tool_text(&j)).unwrap_or(Value::Null);
        status = v.pointer("/job/status").and_then(|s| s.as_str()).unwrap_or("").to_string();
        if matches!(status.as_str(), "done" | "failed" | "error" | "cancelled") {
            let folder = v.get("files_folder").and_then(|f| f.as_str()).unwrap_or("");
            let wavs = std::fs::read_dir(folder)
                .map(|d| d.flatten().filter(|e| e.path().extension().map(|x| x == "wav").unwrap_or(false)).count())
                .unwrap_or(0);
            engine::stop(&state);
            if status != "done" {
                return Err(format!(
                    "the job {status}: {}",
                    v.pointer("/job/error").map(|e| e.to_string()).unwrap_or_default()
                ));
            }
            ok("voiced a line", format!("{wavs} wav file(s) in {folder}"));
            return Ok(());
        }
    }
    engine::stop(&state);
    Err(format!("the job didn't finish (last status {status})"))
}
