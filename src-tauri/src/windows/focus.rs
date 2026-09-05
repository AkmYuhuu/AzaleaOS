use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

/// Returns foreground HWND as u64 if any.
pub fn get_foreground_window() -> Option<u64> {
    unsafe {
        let h = GetForegroundWindow();
        if h.0.is_null() {
            None
        } else {
            Some(h.0 as u64)
        }
    }
}

/// True if `hwnd` is the current foreground window.
pub fn is_foreground(hwnd: u64) -> bool {
    if hwnd == 0 {
        return false;
    }
    unsafe {
        let fg = GetForegroundWindow();
        !fg.0.is_null() && fg.0 as u64 == hwnd
    }
}

/// Helper for identity enrichment - single syscall, no extra alloc.
pub fn is_foreground_cached(hwnd: u64, foreground: Option<u64>) -> bool {
    match foreground {
        Some(fg) => fg == hwnd,
        None => false,
    }
}

// Keep signature aligned with spec: fn get_foreground_window() -> Option<u64>
// and fn is_foreground(hwnd) comparing - both provided above.
