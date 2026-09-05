// host.rs - STEP 9 Window Hosting Prototype (§11, §11.1, §48).
// ONE app test only (Notepad/class "Notepad") → Hosted; all other valid windows → External fallback.
// Unsupported reserved for invalid hwnd only; MVP never returns Unsupported for valid windows.
// Uses SetParent when parent_hwnd supplied; otherwise probes via IsWindow + class check.
// Provides resize/focus/close helpers for hosted lifecycle.

use serde::{Deserialize, Serialize};
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, IsWindow, PostMessageW, SetParent, SetWindowPos, HWND_TOP, SWP_NOACTIVATE,
    SWP_NOZORDER, WM_CLOSE,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum IntegrationMode {
    Hosted,
    External,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostingResult {
    pub hwnd: u64,
    pub mode: IntegrationMode,
    pub reason: Option<String>,
}

fn hwnd_from_u64(hwnd: u64) -> HWND {
    HWND(hwnd as *mut core::ffi::c_void)
}

fn is_window_valid(hwnd: u64) -> bool {
    if hwnd == 0 {
        return false;
    }
    unsafe { IsWindow(hwnd_from_u64(hwnd)).as_bool() }
}

fn get_class_name_for_hwnd(hwnd: u64) -> String {
    if hwnd == 0 {
        return String::new();
    }
    unsafe {
        let h = hwnd_from_u64(hwnd);
        let mut buf: Vec<u16> = vec![0u16; 256];
        let len = GetClassNameW(h, &mut buf);
        if len == 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..len as usize])
    }
}

/// Heuristic - MVP allowlist is Notepad only (class "Notepad").
/// Returns true only for valid Notepad windows; false otherwise (including invalid hwnd).
pub fn can_host_window(hwnd: u64) -> bool {
    if !is_window_valid(hwnd) {
        log::warn!("host.can_host invalid hwnd={} -> false", hwnd);
        return false;
    }
    let class = get_class_name_for_hwnd(hwnd);
    let hostable = class == "Notepad";
    if hostable {
        log::info!("host.can_host hwnd={} class={} -> true", hwnd, class);
    } else {
        log::info!("host.can_host hwnd={} class={} -> false (External fallback)", hwnd, class);
    }
    hostable
}

/// Attempt to host hwnd into parent_hwnd.
/// - invalid hwnd -> Unsupported (reason WindowNotFound)
/// - class Notepad -> Hosted (SetParent if parent provided, else probe-only Hosted)
/// - any other valid window -> External (reason not in allowlist)
pub fn try_host_window(hwnd: u64, parent_hwnd: Option<u64>) -> HostingResult {
    if !is_window_valid(hwnd) {
        log::warn!("host.try_host invalid hwnd={} -> Unsupported", hwnd);
        return HostingResult {
            hwnd,
            mode: IntegrationMode::Unsupported,
            reason: Some("WindowNotFound: invalid hwnd".to_string()),
        };
    }

    let class = get_class_name_for_hwnd(hwnd);

    if class == "Notepad" {
        // Attempt SetParent if parent supplied and valid
        if let Some(parent) = parent_hwnd {
            if parent == 0 || !is_window_valid(parent) {
                log::warn!(
                    "host.try_host Notepad hwnd={} parent invalid {} -> Hosted (probe-only, parent ignored)",
                    hwnd,
                    parent
                );
                return HostingResult {
                    hwnd,
                    mode: IntegrationMode::Hosted,
                    reason: Some("parent invalid, probe-only Hosted".to_string()),
                };
            }
            unsafe {
                let child = hwnd_from_u64(hwnd);
                let parent_hw = hwnd_from_u64(parent);
                match SetParent(child, parent_hw) {
                    Ok(prev) => {
                        // SetParent returns previous parent; null is ok (was top-level)
                        log::info!(
                            "host.try_host Hosted hwnd={} class={} parent={} prevParent={:?}",
                            hwnd,
                            class,
                            parent,
                            prev.0
                        );
                        return HostingResult {
                            hwnd,
                            mode: IntegrationMode::Hosted,
                            reason: None,
                        };
                    }
                    Err(e) => {
                        log::warn!(
                            "host.try_host SetParent failed hwnd={} parent={} err={:?} -> Hosted probe fallback",
                            hwnd,
                            parent,
                            e
                        );
                        // MVP: still report Hosted as probe result; SetParent failure is non-fatal for prototype
                        return HostingResult {
                            hwnd,
                            mode: IntegrationMode::Hosted,
                            reason: Some(format!("SetParent failed: {} (probe Hosted)", e)),
                        };
                    }
                }
            }
        }
        log::info!("host.try_host Hosted hwnd={} class={} (probe-only, no parent)", hwnd, class);
        return HostingResult {
            hwnd,
            mode: IntegrationMode::Hosted,
            reason: None,
        };
    }

    // Valid but not allowlisted -> External fallback (never Unsupported for MVP)
    log::warn!(
        "host.try_host External fallback hwnd={} class={} (not in MVP allowlist)",
        hwnd,
        class
    );
    HostingResult {
        hwnd,
        mode: IntegrationMode::External,
        reason: Some(format!("not hostable in MVP (class={}) -> External", class)),
    }
}

/// Resize hosted window via SetWindowPos (preserves Z-order, no activate).
pub fn resize_hosted(hwnd: u64, width: i32, height: i32) -> Result<(), String> {
    if !is_window_valid(hwnd) {
        log::warn!("host.resize invalid hwnd={}", hwnd);
        return Err(format!("WindowNotFound: hwnd {}", hwnd));
    }
    if width <= 0 || height <= 0 {
        return Err(format!("InvalidPath: width/height must be >0 got {}x{}", width, height));
    }
    unsafe {
        let h = hwnd_from_u64(hwnd);
        let flags = SWP_NOZORDER | SWP_NOACTIVATE;
        // Keep current position (0,0) ignored when using current pos? We pass 0,0 but SetWindowPos will move to 0,0 if not NO_MOVE.
        // To avoid move, fetch current rect and reuse x,y or use SWP_NOMOVE. Use SWP_NOMOVE via SetWindowPos with NOMOVE.
        // Minimal: use 0,0 with SWP_NOMOVE equivalent by fetching bounds.
        // Fallback: pass 0,0 without NOMOVE only if we add it; instead fetch bounds.
        let mut rect = windows::Win32::Foundation::RECT::default();
        let has_rect = windows::Win32::UI::WindowsAndMessaging::GetWindowRect(h, &mut rect).is_ok();
        let (x, y) = if has_rect { (rect.left, rect.top) } else { (0, 0) };
        SetWindowPos(h, HWND_TOP, x, y, width, height, flags)
            .map_err(|e| {
                log::warn!("host.resize failed hwnd={} err={:?}", hwnd, e);
                format!("WindowIntegrationUnsupported: resize failed for hwnd {}: {}", hwnd, e)
            })?;
    }
    log::info!("host.resize ok hwnd={} {}x{}", hwnd, width, height);
    Ok(())
}

/// Focus hosted window via SetForegroundWindow / SetActiveWindow.
pub fn focus_hosted(hwnd: u64) -> Result<(), String> {
    crate::windows::management::focus_window(hwnd).map_err(|e| e.to_string())
}

/// Close hosted window via PostMessage WM_CLOSE (async, safe).
pub fn close_hosted(hwnd: u64) -> Result<(), String> {
    if !is_window_valid(hwnd) {
        log::warn!("host.close invalid hwnd={}", hwnd);
        return Err(format!("WindowNotFound: hwnd {}", hwnd));
    }
    unsafe {
        let h = hwnd_from_u64(hwnd);
        let ok = PostMessageW(h, WM_CLOSE, WPARAM(0), LPARAM(0));
        if ok.is_err() {
            log::warn!("host.close PostMessage failed hwnd={}", hwnd);
            return Err(format!("WindowIntegrationUnsupported: cannot close hwnd {}", hwnd));
        }
    }
    log::info!("host.close ok (WM_CLOSE posted) hwnd={}", hwnd);
    Ok(())
}
