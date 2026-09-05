use serde::{Deserialize, Serialize};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

/// Window bounds - §10.1, camelCase DTO.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// Returns bounds for `hwnd` (u64) via GetWindowRect. None if invalid/unavailable.
pub fn get_window_bounds(hwnd: u64) -> Option<WindowBounds> {
    if hwnd == 0 {
        return None;
    }
    unsafe {
        let h = HWND(hwnd as *mut core::ffi::c_void);
        let mut rect = RECT::default();
        if GetWindowRect(h, &mut rect).is_ok() {
            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;
            Some(WindowBounds {
                x: rect.left,
                y: rect.top,
                width,
                height,
            })
        } else {
            None
        }
    }
}
