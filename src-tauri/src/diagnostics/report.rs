use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsReport {
    pub azalea_version: String,
    pub windows_version: String,
    pub arch: String,
    pub edition: String,
    pub cpu_summary: String,
    pub ram_summary: String,
    pub gpu_summary: String,
    pub known_issues: Vec<String>,
    pub recent_errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsExport {
    pub report: DiagnosticsReport,
    pub log_tail: Vec<String>,
    pub generated_at: String,
    pub path: String,
}

fn diagnostics_base_dir() -> PathBuf {
    if let Ok(v) = std::env::var("LOCALAPPDATA") {
        if !v.trim().is_empty() { return Path::new(&v).join("AzaleaOS").join("Full"); }
    }
    std::env::temp_dir().join("AzaleaOS").join("Full")
}

pub fn diagnostics_dir() -> PathBuf { diagnostics_base_dir().join("diagnostics") }
pub fn logs_dir() -> PathBuf { diagnostics_base_dir().join("Logs") }
pub fn log_file_path() -> PathBuf { logs_dir().join("AzaleaOS-Full.log") }

fn windows_version_string() -> String {
    // Prefer sysinfo long_os_version; fallback to env OS var.
    let v = sysinfo::System::long_os_version().unwrap_or_else(|| "Windows (unknown version)".to_string());
    // sysinfo already includes "Windows ..." on Windows; ensure prefix.
    if v.to_lowercase().contains("windows") { v } else { format!("Windows {}", v) }
}

pub fn generate_report() -> DiagnosticsReport {
    let azalea_version = env!("CARGO_PKG_VERSION").to_string();
    let windows_version = windows_version_string();
    let arch = std::env::consts::ARCH.to_string();
    let edition = crate::app_core::edition::Edition::current().to_string();

    let snap = crate::resources::sampler::snapshot_system();
    let cpu_summary = format!("cpu {:.1}%", snap.cpu_percent);
    let ram_summary = format!(
        "ram total={} used={} available={} ({:.1}% used)",
        snap.ram_total, snap.ram_used, snap.ram_available,
        if snap.ram_total > 0 { snap.ram_used as f64 / snap.ram_total as f64 * 100.0 } else { 0.0 }
    );
    let gpu_summary = snap.gpu_percent.map(|v| format!("gpu {:.1}%", v)).unwrap_or_else(|| "gpu unavailable (MVP stub)".to_string());

    let mut known_issues = Vec::new();
    if snap.gpu_percent.is_none() {
        known_issues.push("GPU metrics unavailable - NVAPI/vendor SDK not in MVP (§14)".to_string());
    }
    if snap.ram_available < 500 * 1024 * 1024 {
        known_issues.push(format!("Low available RAM: {} bytes", snap.ram_available));
    }
    if snap.cpu_percent > 85.0 {
        known_issues.push(format!("High CPU: {:.1}%", snap.cpu_percent));
    }
    // No sensitive data in known_issues.

    // recent_errors: tail INFO log filtered to ERROR/WARN per §34 recent errors
    let log_path = log_file_path();
    let tail = crate::diagnostics::logging::tail_logs_from(&log_path, 200);
    let recent_errors: Vec<String> = tail.iter().filter(|l| l.contains("ERROR") || l.contains("WARN")).cloned().collect();
    // cap to last 20 for payload size
    let recent_errors = if recent_errors.len() > 20 { recent_errors[recent_errors.len()-20..].to_vec() } else { recent_errors };

    log::info!(target: "diagnostics", "diagnostics.report generated version={} edition={}", azalea_version, edition);

    DiagnosticsReport { azalea_version, windows_version, arch, edition, cpu_summary, ram_summary, gpu_summary, known_issues, recent_errors }
}

/// Export diagnostics to %LOCALAPPDATA%\\AzaleaOS\\Full\\diagnostics\\AzaleaDiagnostics_<timestamp>.json
/// If custom_path Some, use its parent dir (validated) else diagnostics_dir.
/// Returns file path on success - local only, no cloud upload per §35.
pub fn export_diagnostics(custom_path: Option<String>) -> Result<String, String> {
    let report = generate_report();
    let log_path = log_file_path();
    let log_tail = crate::diagnostics::logging::tail_logs_from(&log_path, 200);

    let ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let epoch_ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);

    // STEP 20 hardening: reject \0 in custom path (§43 validate path)
    if let Some(ref p) = custom_path {
        if p.contains('\0') {
            return Err(crate::error::AzaleaError::InvalidPath("custom path contains null byte".into()).to_string());
        }
        if p.len() > 32767 {
            return Err(crate::error::AzaleaError::InvalidPath("custom path too long".into()).to_string());
        }
    }

    let (dir, file_name) = if let Some(p) = custom_path.filter(|s| !s.trim().is_empty()) {
        let pb = PathBuf::from(p);
        // If p is a directory or ends with .json, handle.
        if pb.extension().and_then(|e| e.to_str()) == Some("json") {
            let d = pb.parent().map(|d| d.to_path_buf()).unwrap_or_else(diagnostics_dir);
            let f = pb.file_name().and_then(|n| n.to_str()).unwrap_or(&format!("AzaleaDiagnostics_{}.json", ts)).to_string();
            (d, f)
        } else {
            // treat as directory
            (pb, format!("AzaleaDiagnostics_{}.json", ts))
        }
    } else {
        (diagnostics_dir(), format!("AzaleaDiagnostics_{}.json", ts))
    };

    std::fs::create_dir_all(&dir).map_err(|e| format!("create diagnostics dir {}: {}", dir.display(), e))?;
    let file_path = dir.join(&file_name);

    let payload = DiagnosticsExport {
        report,
        log_tail,
        generated_at: chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%z").to_string(),
        path: file_path.display().to_string(),
    };
    // Add epoch for ordering but not required.
    let mut json_val = serde_json::to_value(&payload).map_err(|e| format!("serialize: {}", e))?;
    if let Some(obj) = json_val.as_object_mut() {
        obj.insert("epochMs".to_string(), serde_json::json!(epoch_ms));
    }
    let json = serde_json::to_string_pretty(&json_val).map_err(|e| format!("serialize: {}", e))?;
    std::fs::write(&file_path, json.as_bytes()).map_err(|e| format!("write {}: {}", file_path.display(), e))?;

    log::info!(target: "diagnostics", "diagnostics.export path={}", file_path.display());
    Ok(file_path.display().to_string())
}
