use std::collections::HashMap;

use super::bounds::get_window_bounds;
use super::enumeration::enum_windows;
use super::focus::get_foreground_window;
use super::identity::WindowIdentity;

/// Current snapshot with bounds + foreground enrichment.
/// STEP 5: no events yet, no persistent diff - single snapshot.
/// Filters to visible top-level windows only (is_visible == true) for tracking.
pub fn track_windows() -> Vec<WindowIdentity> {
    let raw = enum_windows();
    let fg = get_foreground_window();

    raw.into_iter()
        .filter(|r| r.is_visible)
        .map(|r| {
            let is_foreground = match fg {
                Some(f) => f == r.hwnd,
                None => false,
            };
            let bounds = get_window_bounds(r.hwnd);
            WindowIdentity {
                hwnd: r.hwnd,
                pid: r.pid,
                title: r.title,
                class_name: r.class_name,
                is_visible: r.is_visible,
                is_foreground,
                bounds,
            }
        })
        .collect()
}

/// STEP 22 - multi-window handling: enumerate windows per pid via tracking, group by pid.
/// Caller can map AppDescriptor → pid(s) → windows. Adapter layer uses this for MultiWindow.
pub fn group_windows_by_pid(windows: Vec<WindowIdentity>) -> HashMap<u32, Vec<WindowIdentity>> {
    let mut map: HashMap<u32, Vec<WindowIdentity>> = HashMap::new();
    for w in windows {
        map.entry(w.pid).or_default().push(w);
    }
    log::info!("tracking.group_by_pid groups={} total_windows={}", map.len(), map.values().map(|v| v.len()).sum::<usize>());
    map
}

/// Convenience: windows for a single pid (filters snapshot).
pub fn windows_for_pid(pid: u32) -> Vec<WindowIdentity> {
    track_windows().into_iter().filter(|w| w.pid == pid).collect()
}

/// Group current live snapshot by pid.
pub fn snapshot_grouped_by_pid() -> HashMap<u32, Vec<WindowIdentity>> {
    group_windows_by_pid(track_windows())
}

/// In-memory tracker with HashMap diff - reserved for STEP 6+ events.
/// STEP 5 exposes only snapshot; diff kept minimal for future window.created/destroyed.
#[allow(dead_code)]
pub mod diff {
    use std::collections::HashMap;

    use super::WindowIdentity;

    #[derive(Debug, Default)]
    pub struct WindowTracker {
        prev: HashMap<u64, WindowIdentity>,
    }

    #[derive(Debug)]
    pub struct WindowDiff {
        pub created: Vec<WindowIdentity>,
        pub destroyed: Vec<WindowIdentity>,
        pub current: Vec<WindowIdentity>,
    }

    impl WindowTracker {
        pub fn new() -> Self {
            Self::default()
        }

        /// Diff current snapshot against previous. Updates internal state.
        pub fn diff(&mut self, current: Vec<WindowIdentity>) -> WindowDiff {
            let cur_map: HashMap<u64, WindowIdentity> =
                current.iter().map(|w| (w.hwnd, w.clone())).collect();

            let created: Vec<WindowIdentity> = cur_map
                .keys()
                .filter(|k| !self.prev.contains_key(*k))
                .filter_map(|k| cur_map.get(k).cloned())
                .collect();

            let destroyed: Vec<WindowIdentity> = self
                .prev
                .keys()
                .filter(|k| !cur_map.contains_key(*k))
                .filter_map(|k| self.prev.get(k).cloned())
                .collect();

            self.prev = cur_map;

            WindowDiff {
                created,
                destroyed,
                current,
            }
        }
    }
}
