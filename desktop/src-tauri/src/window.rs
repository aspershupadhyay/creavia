//! The main window, built here rather than from tauri.conf.json so the web view starts with the right flags.
//!
//! On Windows the studio is drawn by WebView2, Edge's engine. On some PCs its graphics side (the GPU driver, or a
//! damaged graphics cache) crashes the page, and WebView2 shows "This page is having a problem / Out of Memory".
//! Creavia heals that by itself: when the page's process dies, it clears WebView2's graphics caches and opens again
//! in safe graphics (drawn without the GPU, which looks the same for an app like this). Safe graphics stays on for
//! that computer; `creavia --gpu` (or deleting `safe-graphics` in the app's folder) turns it back off.
//! `creavia --safe-graphics` turns it on by hand.
use tauri::{App, WebviewWindowBuilder};

#[cfg(windows)]
use std::{fs, path::PathBuf};

#[cfg(windows)]
fn flag() -> PathBuf { crate::store::data_dir().join("safe-graphics") }

/// Is safe graphics on for this computer?
#[cfg(windows)]
fn safe_graphics() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--gpu") { let _ = fs::remove_file(flag()); return false; }
    if args.iter().any(|a| a == "--safe-graphics") { let _ = fs::write(flag(), "on"); }
    std::env::var_os("CREAVIA_SAFE_GRAPHICS").is_some() || flag().exists()
}

/// WebView2's caches that hold compiled graphics; a damaged one can crash the page on every start.
#[cfg(windows)]
fn clear_graphics_caches(app: &App) {
    use tauri::Manager;
    let Ok(local) = app.path().app_local_data_dir() else { return };
    let web = local.join("EBWebView");
    for d in ["GrShaderCache", "ShaderCache", "GraphiteDawnCache", "GPUPersistentCache"] { let _ = fs::remove_dir_all(web.join(d)); }
    for d in ["GPUCache", "DawnGraphiteCache", "DawnWebGPUCache", "Code Cache"] { let _ = fs::remove_dir_all(web.join("Default").join(d)); }
}

pub fn create_main(app: &App) -> tauri::Result<()> {
    let cfg = app.config().app.windows.iter().find(|w| w.label == "main").cloned().expect("the main window's config");
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::from_config(app.handle(), &cfg)?;

    #[cfg(windows)]
    let safe = {
        let safe = safe_graphics();
        // what Tauri passes by default (no mini menu, no SmartScreen on the app's own pages), plus ours
        let mut args = String::from("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
        if safe {
            // the flag file says "fresh" the first start after a crash: clear the caches while nothing holds them
            if fs::read_to_string(flag()).map(|s| s.trim() == "fresh").unwrap_or(false) {
                clear_graphics_caches(app);
                let _ = fs::write(flag(), "on");
            }
            args.push_str(" --disable-gpu --disable-gpu-compositing");
        }
        // a debugging port for tests (.github/workflows/winprobe.yml); off unless asked for
        if let Some(port) = std::env::var("CREAVIA_WEBVIEW_DEBUG_PORT").ok().filter(|p| p.parse::<u16>().is_ok()) {
            args.push_str(&format!(" --remote-debugging-port={port}"));
        }
        builder = builder.additional_browser_args(&args);
        safe
    };

    let window = builder.build()?;
    #[cfg(windows)]
    heal_crashes(&window, safe);
    #[cfg(not(windows))]
    let _ = window;
    Ok(())
}

/// When the page's process dies: the first time, switch to safe graphics and reopen; after that, reload the page a
/// few times (never in a loop).
#[cfg(windows)]
fn heal_crashes(window: &tauri::WebviewWindow, safe: bool) {
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;
    use tauri::Manager;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::ProcessFailedEventHandler;

    let app = window.app_handle().clone();
    let reloads = Arc::new(AtomicU32::new(0));
    let _ = window.with_webview(move |wv| unsafe {
        let Ok(core) = wv.controller().CoreWebView2() else { return };
        let handler = ProcessFailedEventHandler::create(Box::new(move |_sender, args| {
            let Some(args) = args else { return Ok(()) };
            let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
            args.ProcessFailedKind(&mut kind)?;
            let page_died = kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED
                || kind == COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED
                || kind == COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED;
            if !page_died { return Ok(()); }
            log::warn!("web view process failed ({}), safe graphics: {safe}", kind.0);
            if !safe {
                let _ = fs::write(flag(), "fresh");
                app.restart();
            }
            if reloads.fetch_add(1, Ordering::SeqCst) < 3 {
                if let Some(w) = app.get_webview_window("main") { let _ = w.reload(); }
            }
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core.add_ProcessFailed(&handler, &mut token);
    });
}
