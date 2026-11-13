//! Creavia desktop: the studio's screens in a native window, with Rust underneath for what a browser can't do well:
//! holding your sign-in, every network call (net.rs), downloading models you pick (models.rs), running the engine
//! on this computer (engine.rs), an MCP server for your AI apps (mcp.rs) and knowing the machine (sys.rs).
mod engine;
mod mcp;
mod models;
mod net;
mod selfcheck;
mod store;
mod sys;
mod updater;

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, State,
};

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<store::Store>,
    pub net: Arc<net::Net>,
    pub downloads: Arc<models::Downloads>,
    pub engine: Arc<engine::Engine>,
    pub mcp: Arc<mcp::Mcp>,
}

#[derive(Serialize)]
struct AppSettings { hf_token_set: bool, models_dir: String, mcp_autostart: bool, engine_autostart: bool, onboarded: bool, launch_at_login: bool }

fn app_settings(state: &AppState) -> AppSettings {
    let s = state.store.settings();
    AppSettings { hf_token_set: state.store.secret("hf_token").is_some(), models_dir: s.models_dir, mcp_autostart: s.mcp_autostart,
        engine_autostart: s.engine_autostart, onboarded: s.onboarded, launch_at_login: s.launch_at_login }
}

#[derive(Deserialize)]
struct Patch { hf_token: Option<String>, models_dir: Option<String>, engine_autostart: Option<bool>, onboarded: Option<bool>, launch_at_login: Option<bool> }

#[tauri::command]
fn settings_get(state: State<'_, AppState>) -> AppSettings { app_settings(&state) }

#[tauri::command]
fn settings_set(patch: Patch, state: State<'_, AppState>) -> Result<AppSettings, String> {
    if let Some(t) = patch.hf_token { let t = t.trim(); state.store.set_secret("hf_token", if t.is_empty() { None } else { Some(t) }); }
    if let Some(dir) = &patch.models_dir {
        let p = std::path::PathBuf::from(dir.trim());
        if !p.is_absolute() { return Err("Pick a full folder path".into()); }
        std::fs::create_dir_all(&p).map_err(|e| format!("Can't use that folder: {e}"))?;
    }
    state.store.update(|s| {
        if let Some(d) = patch.models_dir { s.models_dir = d.trim().into(); }
        if let Some(v) = patch.engine_autostart { s.engine_autostart = v; }
        if let Some(v) = patch.onboarded { s.onboarded = v; }
        if let Some(v) = patch.launch_at_login { s.launch_at_login = v; }
    });
    Ok(app_settings(&state))
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn run() {
    let state = AppState {
        store: Arc::new(store::Store::load()),
        net: Arc::new(net::Net::new()),
        downloads: Arc::new(models::Downloads::default()),
        engine: Arc::new(engine::Engine::default()),
        mcp: Arc::new(mcp::Mcp::default()),
    };
    let for_scheme = state.clone();

    // `creavia --self-check[=full]`: test the Rust side headless, then exit (selfcheck.rs)
    if let Some(arg) = std::env::args().find(|a| a.starts_with("--self-check")) {
        let full = arg.ends_with("=full");
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let res = rt.block_on(selfcheck::run(state, full));
        match res { Ok(()) => { println!("all good"); std::process::exit(0) } Err(e) => { eprintln!("FAIL {e}"); std::process::exit(1) } }
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state)
        .register_asynchronous_uri_scheme_protocol("cloud", move |_ctx, request, responder| {
            let st = for_scheme.clone();
            tauri::async_runtime::spawn(async move { responder.respond(net::serve_scheme(&st, request).await); });
        })
        .setup(|app| {
            // the tray: open the studio, and quit (which also stops the engine)
            let open = MenuItem::with_id(app, "open", "Open Creavia", true, None::<&str>)?;
            let models = MenuItem::with_id(app, "models", "Models…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Creavia", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &models, &PredefinedMenuItem::separator(app)?, &quit])?;
            TrayIconBuilder::with_id("creavia")
                .icon(app.default_window_icon().cloned().expect("icon"))
                .tooltip("Creavia")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "open" => show_main(app),
                    "models" => { show_main(app); if let Some(w) = app.get_webview_window("main") { let _ = w.eval("window.__creaviaGo && window.__creaviaGo('/local/models')"); } }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = e { show_main(tray.app_handle()); }
                })
                .build(app)?;

            // what was on last time comes back on
            let st = app.state::<AppState>().inner().clone();
            let s = st.store.settings();
            if s.mcp_autostart {
                let st = st.clone();
                tauri::async_runtime::spawn(async move { let _ = mcp::start(st, s.mcp_port).await; });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings_get, settings_set,
            net::http, net::http_stage, net::http_send, net::cloud_get, net::cloud_login, net::cloud_use_token, net::cloud_logout, net::download,
            sys::system_info,
            models::models_catalog, models::models_state, models::model_download, models::model_cancel, models::model_delete,
            engine::engine_status, engine::engine_install, engine::engine_start, engine::engine_stop, engine::engine_logs,
            mcp::mcp_status, mcp::mcp_start, mcp::mcp_stop, mcp::mcp_rotate,
            updater::update_check, updater::update_install, updater::app_version,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Creavia");

    app.run(|app, e| {
        if let RunEvent::Exit = e { engine::stop(app.state::<AppState>().inner()); }
    });
}
