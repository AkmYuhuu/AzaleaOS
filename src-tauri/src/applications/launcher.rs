use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::applications::registry;
use crate::error::AzaleaError;

/// Launch result - DTO camelCase for Tauri IPC (§7 Flow: Bind runtime identity).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub pid: u32,
    pub hwnd: Option<u64>,
    pub app_id: String,
}

/// Launch by appId - §7 strict flow.
///
/// Steps:
/// 1. registry.get_by_id(app_id) -> descriptor else AppNotFound
/// 2. validate supported else UnsupportedEdition
/// 3. validate executable_path exists and is file else InvalidPath/AppLaunchFailed
/// 4. structured Command::new(exe_path).spawn() - no shell concat
/// 5. poll windows via track_windows() 100-300ms for hwnd matching pid and title contains name
/// 6. bind runtime identity (pid + hwnd Option)
/// 7. log INFO `app.started` / `app.state_changed` (emit via AppHandle done in IPC wrapper)
pub fn launch_app(app_id: String) -> Result<LaunchResult, AzaleaError> {
    // 1. descriptor lookup
    let descriptor = registry::get_by_id(&app_id).ok_or_else(|| {
        AzaleaError::AppNotFound(format!("app not found: {}", app_id))
    })?;

    // 2. supported check (§36 UnsupportedEdition)
    if !descriptor.supported {
        let reason = descriptor
            .unsupported_reason
            .clone()
            .unwrap_or_else(|| "unsupported".to_string());
        return Err(AzaleaError::UnsupportedEdition(format!(
            "app {} unsupported: {}",
            app_id, reason
        )));
    }

    // 3. validate executable_path
    let exe_str = descriptor.executable_path.as_deref().ok_or_else(|| {
        AzaleaError::InvalidPath(format!(
            "app {} has no executable_path (name={})",
            app_id, descriptor.name
        ))
    })?;
    if exe_str.trim().is_empty() {
        return Err(AzaleaError::InvalidPath(format!(
            "app {} executable_path is empty",
            app_id
        )));
    }
    let exe_path = Path::new(exe_str);
    if !exe_path.exists() {
        return Err(AzaleaError::InvalidPath(format!(
            "executable not found: {}",
            exe_str
        )));
    }
    if !exe_path.is_file() {
        return Err(AzaleaError::InvalidPath(format!(
            "executable is not a file: {}",
            exe_str
        )));
    }

    // 4. structured process creation - no shell string concat
    // For MVP no args; Command::new takes validated path directly.
    let child = std::process::Command::new(exe_path)
        .spawn()
        .map_err(|e| {
            AzaleaError::AppLaunchFailed(format!(
                "failed to launch {} ({}): {}",
                descriptor.name, exe_str, e
            ))
        })?;

    let pid = child.id();
    log::info!("app.started appId={} pid={} exe={}", app_id, pid, exe_str);
    // Avoid zombie handle leak - detach; child will be reaped by OS.
    // Do not wait() - keep handle dropped after pid captured.
    // Drop child without waiting: we already have pid; detach via forget-like drop.
    // Explicitly forget child handle to avoid blocking: just drop (child will be reaped).
    std::mem::forget(child);

    // 5. wait small delay and poll for window matching pid and title contains name
    // Poll 3 x 100ms = 300ms total window
    let hwnd = poll_window_for_pid(pid, &descriptor.name);

    log::info!(
        "app.state_changed appId={} pid={} hwnd={:?} name={}",
        app_id,
        pid,
        hwnd,
        descriptor.name
    );

    Ok(LaunchResult {
        pid,
        hwnd,
        app_id,
    })
}

fn poll_window_for_pid(pid: u32, app_name: &str) -> Option<u64> {
    // Initial small delay before first poll helps notepad/chrome create window
    std::thread::sleep(std::time::Duration::from_millis(100));
    let needle = app_name.to_lowercase();
    for _ in 0..3 {
        let windows = crate::windows::tracking::track_windows();
        // Prefer window where pid matches and title contains name (case-insensitive)
        if let Some(w) = windows
            .iter()
            .find(|w| w.pid == pid && w.title.to_lowercase().contains(&needle))
        {
            return Some(w.hwnd);
        }
        // Fallback: any visible window with matching pid (first)
        if let Some(w) = windows.iter().find(|w| w.pid == pid) {
            return Some(w.hwnd);
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    None
}

/// Emit helper used by IPC - tries AppHandle.emit, falls back to log INFO if unavailable.
pub fn emit_launch_events(handle: Option<&tauri::AppHandle>, result: &LaunchResult) {
    if let Some(h) = handle {
        // Best-effort emit; ignore error if frontend not listening
        let payload = serde_json::json!({
            "appId": result.app_id,
            "pid": result.pid,
            "hwnd": result.hwnd,
        });
        // `emit` is on Manager trait; AppHandle implements it in Tauri 2
        use tauri::Emitter;
        let _ = h.emit("app.started", payload.clone());
        let _ = h.emit("app.state_changed", payload);
        log::info!(
            "emit app.started/app.state_changed appId={} pid={}",
            result.app_id,
            result.pid
        );
    } else {
        log::info!(
            "app.started (no handle) appId={} pid={} hwnd={:?}",
            result.app_id,
            result.pid,
            result.hwnd
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn launch_unknown_returns_app_not_found() {
        let err = launch_app("nonexistent-app-id-xyz".to_string()).unwrap_err();
        match err {
            AzaleaError::AppNotFound(_) => {},
            other => panic!("expected AppNotFound, got {}", other),
        }
    }
}
