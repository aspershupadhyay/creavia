//! Updates without reinstalling: the app asks GitHub Releases for latest.json (made by CI on every version tag), checks
//! the download's signature against the public key in tauri.conf.json, installs it and restarts. Nothing unsigned is
//! ever installed. The screen polls `update_check` (on launch, then every few hours) and calls `update_install`.
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
pub struct Available {
    version: String,
    current: String,
    notes: Option<String>,
    date: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Progress {
    Started { total: Option<u64> },
    Chunk { done: u64 },
    Installing,
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<Available>, String> {
    let up = app.updater().map_err(|e| e.to_string())?;
    let found = up.check().await.map_err(|e| e.to_string())?;
    Ok(found.map(|u| Available {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone(),
        date: u.date.map(|d| d.to_string()),
    }))
}

#[tauri::command]
pub async fn update_install(app: AppHandle, on_event: Channel<Progress>) -> Result<(), String> {
    let up = app.updater().map_err(|e| e.to_string())?;
    let Some(u) = up.check().await.map_err(|e| e.to_string())? else { return Err("Already up to date".into()) };
    let mut done = 0u64;
    let mut started = false;
    u.download_and_install(
        |n, total| {
            if !started {
                started = true;
                let _ = on_event.send(Progress::Started { total });
            }
            done += n as u64;
            let _ = on_event.send(Progress::Chunk { done });
        },
        || {
            let _ = on_event.send(Progress::Installing);
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    app.restart();
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}
