use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Input::KeyboardAndMouse::SetActiveWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, IsIconic, IsWindow, IsWindowVisible, IsZoomed, SetForegroundWindow,
    SetWindowPos, ShowWindow, HWND_TOP, SWP_NOACTIVATE, SWP_NOZORDER, SW_MINIMIZE, SW_RESTORE,
};

use crate::error::AzaleaError;

use super::bounds::WindowBounds;

fn hwnd_from_u64(hwnd: u64) -> HWND {
    HWND(hwnd as *mut core::ffi::c_void)
}

fn is_window_exists(hwnd: u64) -> bool {
    if hwnd == 0 {
        return false;
    }
    unsafe { IsWindow(hwnd_from_u64(hwnd)).as_bool() }
}

/// Focus window via SetForegroundWindow + SetActiveWindow + BringWindowToTop.
/// Validates hwnd via IsWindow else WindowNotFound. On failure returns WindowIntegrationUnsupported.
pub fn focus_window(hwnd: u64) -> Result<(), AzaleaError> {
    if !is_window_exists(hwnd) {
        log::warn!("window.focus failed: WindowNotFound hwnd={}", hwnd);
        return Err(AzaleaError::WindowNotFound(format!(
            "hwnd {} not found",
            hwnd
        )));
    }
    unsafe {
        let h = hwnd_from_u64(hwnd);
        let fg_ok = SetForegroundWindow(h).as_bool();
        let active_ok = SetActiveWindow(h).is_ok();
        let top_ok = BringWindowToTop(h).is_ok();
        if !fg_ok && !active_ok && !top_ok {
            log::warn!(
                "window.focus failed: WindowIntegrationUnsupported hwnd={} fg_ok={} active_ok={} top_ok={}",
                hwnd,
                fg_ok,
                active_ok,
                top_ok
            );
            return Err(AzaleaError::WindowIntegrationUnsupported(format!(
                "cannot focus hwnd {}",
                hwnd
            )));
        }
        log::info!("window.focus ok hwnd={}", hwnd);
        Ok(())
    }
}

/// Minimize window via ShowWindow SW_MINIMIZE. Checks IsIconic.
/// Validates hwnd via IsWindow else WindowNotFound. No panic.
pub fn minimize_window(hwnd: u64) -> Result<(), AzaleaError> {
    if !is_window_exists(hwnd) {
        log::warn!("window.minimize failed: WindowNotFound hwnd={}", hwnd);
        return Err(AzaleaError::WindowNotFound(format!(
            "hwnd {} not found",
            hwnd
        )));
    }
    unsafe {
        let h = hwnd_from_u64(hwnd);
        if IsIconic(h).as_bool() {
            log::info!("window.minimize already iconic hwnd={}", hwnd);
            return Ok(());
        }
        let _ = ShowWindow(h, SW_MINIMIZE);
        if !IsIconic(h).as_bool() {
            log::warn!(
                "window.minimize failed: WindowIntegrationUnsupported hwnd={}",
                hwnd
            );
            return Err(AzaleaError::WindowIntegrationUnsupported(format!(
                "cannot minimize hwnd {}",
                hwnd
            )));
        }
        log::info!("window.minimize ok hwnd={}", hwnd);
        Ok(())
    }
}

/// Restore window via ShowWindow SW_RESTORE. Checks IsIconic / IsZoomed.
/// Validates hwnd via IsWindow else WindowNotFound.
pub fn restore_window(hwnd: u64) -> Result<(), AzaleaError> {
    if !is_window_exists(hwnd) {
        log::warn!("window.restore failed: WindowNotFound hwnd={}", hwnd);
        return Err(AzaleaError::WindowNotFound(format!(
            "hwnd {} not found",
            hwnd
        )));
    }
    unsafe {
        let h = hwnd_from_u64(hwnd);
        // Always attempt restore; ShowWindow handles non-minimized case as no-op
        let _ = ShowWindow(h, SW_RESTORE);
        // If still iconic after restore, consider failure
        if IsIconic(h).as_bool() {
            log::warn!(
                "window.restore failed: WindowIntegrationUnsupported hwnd={} still iconic",
                hwnd
            );
            return Err(AzaleaError::WindowIntegrationUnsupported(format!(
                "cannot restore hwnd {}",
                hwnd
            )));
        }
        // IsZoomed not failure after restore (maximized -> restored is allowed); just log
        let _zoomed = IsZoomed(h).as_bool();
        log::info!("window.restore ok hwnd={}", hwnd);
        Ok(())
    }
}

/// Get bounds via GetWindowRect (reuse bounds.rs). Validates hwnd via IsWindow else None + WARN.
pub fn get_bounds(hwnd: u64) -> Option<WindowBounds> {
    if !is_window_exists(hwnd) {
        log::warn!("window.get_bounds failed: WindowNotFound hwnd={}", hwnd);
        return None;
    }
    super::bounds::get_window_bounds(hwnd)
}

/// Set bounds via SetWindowPos with SWP_NOZORDER | SWP_NOACTIVATE.
/// Validates hwnd via IsWindow else WindowNotFound. Validates width/height >0 else InvalidPath.
pub fn set_bounds(hwnd: u64, x: i32, y: i32, width: i32, height: i32) -> Result<(), AzaleaError> {
    if !is_window_exists(hwnd) {
        log::warn!("window.set_bounds failed: WindowNotFound hwnd={}", hwnd);
        return Err(AzaleaError::WindowNotFound(format!(
            "hwnd {} not found",
            hwnd
        )));
    }
    if width <= 0 || height <= 0 {
        log::warn!(
            "window.set_bounds failed: InvalidPath hwnd={} width={} height={}",
            hwnd,
            width,
            height
        );
        return Err(AzaleaError::InvalidPath(format!(
            "width and height must be >0, got {}x{}",
            width, height
        )));
    }
    unsafe {
        let h = hwnd_from_u64(hwnd);
        let flags = SWP_NOZORDER | SWP_NOACTIVATE;
        match SetWindowPos(h, HWND_TOP, x, y, width, height, flags) {
            Ok(()) => {
                log::info!(
                    "window.set_bounds ok hwnd={} x={} y={} w={} h={}",
                    hwnd,
                    x,
                    y,
                    width,
                    height
                );
                Ok(())
            }
            Err(e) => {
                log::warn!(
                    "window.set_bounds failed: WindowIntegrationUnsupported hwnd={} err={:?}",
                    hwnd,
                    e
                );
                Err(AzaleaError::WindowIntegrationUnsupported(format!(
                    "cannot set bounds for hwnd {}: {}",
                    hwnd, e
                )))
            }
        }
    }
}

/// Visibility via IsWindowVisible + IsWindow. Validates hwnd via IsWindow else false + WARN.
pub fn is_visible(hwnd: u64) -> bool {
    if hwnd == 0 {
        return false;
    }
    unsafe {
        let h = hwnd_from_u64(hwnd);
        if !IsWindow(h).as_bool() {
            log::warn!("window.is_visible failed: WindowNotFound hwnd={}", hwnd);
            return false;
        }
        IsWindowVisible(h).as_bool()
    }
}
