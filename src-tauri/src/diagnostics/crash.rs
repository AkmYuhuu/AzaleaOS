//! Crash / recovery separation per §37.
//!
//! Separation:
//!   Core     = Rust native core (this process) - panic hook logs ERROR, process stays if possible
//!   UI       = Tauri WebView - crash is isolated; strategy is window reload / recreate if feasible
//!   Managed  = External Windows apps (PID/HWND) - crash detected via is_alive (process exit)
//!
//! MVP: install panic hook that logs ERROR; do not attempt unsafe process resurrection.

use std::sync::OnceLock;

static HOOK_INSTALLED: OnceLock<()> = OnceLock::new();

/// Install global panic hook - logs ERROR with payload + location.
/// Idempotent. Must be called once at startup (Core).
pub fn install_panic_hook() {
    if HOOK_INSTALLED.get().is_some() { return; }
    // Take default hook so we still print to stderr after logging.
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() { s.to_string() }
        else if let Some(s) = info.payload().downcast_ref::<String>() { s.clone() }
        else { "unknown panic payload".to_string() };
        let loc = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_else(|| "unknown location".into());
        // Structured ERROR per §34 - no sensitive data.
        log::error!(target: "core", "core.panic payload={} location={}", payload, loc);
        default(info);
    }));
    let _ = HOOK_INSTALLED.set(());
}

/// Managed app crash detection - true if PID no longer alive.
/// Caller should have previously seen the PID as alive; for MVP this is
/// simply `!is_alive(pid)` per processes::lifecycle.
pub fn is_managed_app_crashed(pid: u32) -> bool {
    if pid == 0 { return true; }
    !crate::processes::lifecycle::is_alive(pid)
}

/// Alias per task spec.
pub fn check_app_crashed(pid: u32) -> bool { is_managed_app_crashed(pid) }

/// UI restart strategy hint - feasible path per §37.
/// Core remains; UI can be restarted via Tauri window reload.
/// This is documentation + a safe no-op for MVP (real reload is frontend `window.location.reload()` or `appHandle.restart()` in Tauri).
pub fn ui_restart_strategy() -> &'static str {
    "core remains; UI restart via window reload (Tauri window recreate / location.reload) - no managed app auto-restart"
}
