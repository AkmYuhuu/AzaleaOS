use serde::{Deserialize, Serialize};

use super::bounds::WindowBounds;

/// Window identity - §10.1. DTO-ready camelCase for Tauri IPC.
/// HWND represented safely as u64 (never truncated on 32/64-bit). PID is u32.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowIdentity {
    pub hwnd: u64,
    pub pid: u32,
    pub title: String,
    pub class_name: String,
    pub is_visible: bool,
    pub is_foreground: bool,
    pub bounds: Option<WindowBounds>,
}

/// Raw window from enumeration - internal, before enrichment with bounds/foreground.
#[derive(Debug, Clone)]
pub struct RawWindow {
    pub hwnd: u64,
    pub pid: u32,
    pub title: String,
    pub class_name: String,
    pub is_visible: bool,
}
