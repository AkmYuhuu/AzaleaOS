use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    IsWindowVisible,
};

use super::identity::RawWindow;

/// Enumerate top-level windows via EnumWindows.
/// For each HWND get PID via GetWindowThreadProcessId, visibility via IsWindowVisible,
/// title via GetWindowTextW, class name via GetClassNameW.
/// Returns all windows; caller (tracking.rs) filters visibility as needed.
/// Never panics - on EnumWindows failure returns empty vec and logs.
pub fn enum_windows() -> Vec<RawWindow> {
    let mut buf: Vec<RawWindow> = Vec::new();
    unsafe {
        let ptr = LPARAM(&mut buf as *mut Vec<RawWindow> as isize);
        if EnumWindows(Some(enum_proc), ptr).is_err() {
            log::warn!("EnumWindows failed");
            return Vec::new();
        }
    }
    buf
}

unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    // Reconstruct &mut Vec<RawWindow> from LPARAM
    let out: &mut Vec<RawWindow> = unsafe { &mut *(lparam.0 as *mut Vec<RawWindow>) };

    // HWND as u64
    let hwnd_u64 = hwnd.0 as u64;
    if hwnd_u64 == 0 {
        return BOOL(1);
    }

    // PID
    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };

    // Visibility
    let is_visible = unsafe { IsWindowVisible(hwnd).as_bool() };

    // Title
    let title = unsafe { get_window_text(hwnd) };
    // Class name
    let class_name = unsafe { get_class_name(hwnd) };

    out.push(RawWindow {
        hwnd: hwnd_u64,
        pid,
        title,
        class_name,
        is_visible,
    });

    BOOL(1) // continue enumeration
}

unsafe fn get_window_text(hwnd: HWND) -> String {
    // GetWindowTextLengthW returns length without null terminator
    let len = unsafe { GetWindowTextLengthW(hwnd) };
    if len == 0 {
        return String::new();
    }
    // Allocate len+1 for null terminator; windows crate expects buffer length in chars
    let mut buf: Vec<u16> = vec![0u16; (len + 1) as usize];
    let copied = unsafe { GetWindowTextW(hwnd, &mut buf) };
    if copied == 0 {
        return String::new();
    }
    let slice = &buf[..copied as usize];
    String::from_utf16_lossy(slice)
}

unsafe fn get_class_name(hwnd: HWND) -> String {
    let mut buf: Vec<u16> = vec![0u16; 256];
    let copied = unsafe { GetClassNameW(hwnd, &mut buf) };
    if copied == 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..copied as usize])
}
