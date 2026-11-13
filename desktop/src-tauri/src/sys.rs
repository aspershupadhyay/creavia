//! This computer: what it can run (GPU, memory, disk) and which tools are there (uv, Python).
use crate::{store, AppState};
use serde::Serialize;
use std::{path::Path, process::Command};
use tauri::State;

#[derive(Serialize, Clone)]
pub struct Gpu { name: String, vram_gb: f64, vendor: String }

#[derive(Serialize)]
pub struct SystemInfo {
    os: String, arch: String, cpu: String, cores: usize, ram_gb: f64, gpus: Vec<Gpu>,
    data_dir: String, models_dir: String, disk_free_gb: f64, uv: Option<String>, python: Option<String>, version: String,
}

/// Free bytes on the disk that holds `p` (0 when unknown).
pub fn free_bytes(p: &Path) -> u64 {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let target = std::fs::canonicalize(p).or_else(|_| std::fs::canonicalize(p.parent().unwrap_or(p))).unwrap_or_else(|_| p.to_path_buf());
    disks.list().iter().filter(|d| target.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len()).map(|d| d.available_space()).unwrap_or(0)
}

/// A command-line tool on PATH, or in the usual places an installer puts it.
pub fn which(name: &str) -> Option<String> {
    let exe = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    let mut dirs: Vec<std::path::PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    if let Some(h) = dirs::home_dir() { dirs.push(h.join(".local/bin")); dirs.push(h.join(".cargo/bin")); }
    dirs.extend(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"].iter().map(std::path::PathBuf::from));
    dirs.into_iter().map(|d| d.join(&exe)).find(|p| p.is_file()).map(|p| p.to_string_lossy().into_owned())
}

fn nvidia() -> Vec<Gpu> {
    let Ok(out) = Command::new("nvidia-smi").args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]).output() else { return vec![] };
    String::from_utf8_lossy(&out.stdout).lines().filter_map(|l| {
        let (n, m) = l.rsplit_once(',')?;
        Some(Gpu { name: n.trim().into(), vram_gb: m.trim().parse::<f64>().ok()? / 1024.0, vendor: "nvidia".into() })
    }).collect()
}

fn apple(ram_gb: f64) -> Vec<Gpu> {
    if !(cfg!(target_os = "macos") && cfg!(target_arch = "aarch64")) { return vec![]; }
    let chip = Command::new("sysctl").args(["-n", "machdep.cpu.brand_string"]).output().ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_else(|| "Apple Silicon".into());
    // unified memory: about three quarters of it is usable by the GPU
    vec![Gpu { name: format!("{chip} GPU"), vram_gb: (ram_gb * 0.75).floor(), vendor: "apple".into() }]
}

#[tauri::command]
pub fn system_info(state: State<'_, AppState>) -> SystemInfo {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    sys.refresh_cpu_list(sysinfo::CpuRefreshKind::nothing());
    let ram_gb = sys.total_memory() as f64 / 1024f64.powi(3);
    let mut gpus = nvidia();
    if gpus.is_empty() { gpus = apple(ram_gb); }
    let settings = state.store.settings();
    let models = store::engine_home(&settings);
    SystemInfo {
        os: format!("{} {}", sysinfo::System::name().unwrap_or_default(), sysinfo::System::os_version().unwrap_or_default()).trim().to_string(),
        arch: std::env::consts::ARCH.into(),
        cpu: sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default(),
        cores: sys.cpus().len(),
        ram_gb,
        gpus,
        data_dir: store::data_dir().to_string_lossy().into_owned(),
        models_dir: models.to_string_lossy().into_owned(),
        disk_free_gb: free_bytes(&models) as f64 / 1e9,
        uv: which("uv"),
        python: which("python3").or_else(|| which("python")),
        version: env!("CARGO_PKG_VERSION").into(),
    }
}
