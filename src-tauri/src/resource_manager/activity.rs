use serde::{Deserialize, Serialize};

use crate::applications::descriptor::AppCategory;
use crate::processes::metrics as proc_metrics;
use crate::resources::{disk, network};
use crate::windows::focus;

/// Foreground vs background - §16 activity engine
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActivityState {
    Foreground,
    Background,
}

impl Default for ActivityState {
    fn default() -> Self {
        Self::Background
    }
}

/// Activity detection result - §16 observe-only (§48 STEP 12)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityInfo {
    pub state: ActivityState,
    /// true if cpu > 5.0 - "cpu activity" signal per spec §16 + task thresholds
    pub cpu_activity: bool,
    /// true if protected conditions hold (§16,§22,§23)
    pub protected: bool,
    pub is_game: bool,
    pub is_unknown: bool,
    /// live sample (or injected in tests) - diagnostic, not decision-hidden
    pub cpu_percent: f32,
    /// human-readable reason / protected trigger
    pub reason: String,
}

// --- category helpers ---

/// Returns (is_game, is_unknown) for an app_id via registry lookup.
/// Missing descriptor → Unknown (conservative per §6 + §22).
fn category_flags(app_id: &str) -> (bool, bool) {
    if app_id.is_empty() {
        return (false, true);
    }
    match crate::applications::registry::get_by_id(app_id) {
        Some(desc) => match desc.category {
            AppCategory::Game => (true, false),
            AppCategory::Unknown => (false, true),
            _ => (false, false),
        },
        None => (false, true),
    }
}

/// True if app_id maps to Game category (§6, §23)
pub fn is_game_category(app_id: &str) -> bool {
    category_flags(app_id).0
}

/// True if app_id is Unknown / missing (conservative path §6 → §22 unknown→protect)
pub fn is_unknown_category(app_id: &str) -> bool {
    category_flags(app_id).1
}

/// Foreground detection via Win32 GetForegroundWindow (§10.1, §16 foreground state)
pub fn get_activity_state(hwnd: u64) -> ActivityState {
    if hwnd == 0 {
        return ActivityState::Background;
    }
    if focus::is_foreground(hwnd) {
        ActivityState::Foreground
    } else {
        // Also handle cached foreground None - treat as Background
        ActivityState::Background
    }
}

/// CPU activity signal threshold - spec §16 CPU activity, task §48 STEP12
/// >5% is considered active (MVP observation threshold)
pub fn is_cpu_active(cpu_percent: f32) -> bool {
    cpu_percent.is_finite() && cpu_percent > 5.0
}

/// Protected trigger evaluation - pure, testable
/// Inputs: state, cpu, network (rx+tx), disk%, is_game, is_unknown
// honey: O(1) pure; expand when child-process / known-profile signals land (§16)
pub fn compute_protected(
    state: ActivityState,
    cpu_percent: f32,
    network_rx: u64,
    network_tx: u64,
    disk_activity: f32,
    is_game: bool,
    is_unknown: bool,
) -> (bool, String) {
    // §23 Game → always protected (GAME PROTECTED), no aggressive optimization
    if is_game {
        return (true, "game-protected".to_string());
    }

    // Foreground → ACTIVE, not protected via background protection (§16 flow ACTIVE→BACKGROUND→PROTECTED)
    // Log reason but don't protect; foreground protection is implicit via ACTIVE state.
    if state == ActivityState::Foreground {
        return (false, "foreground-active".to_string());
    }

    // Background protected conditions per §16: cpu, network, disk, child processes, known profile, known op
    // Stubs for network/disk (MVP 0) - mocked thresholds below
    let network_bytes = network_rx.saturating_add(network_tx);
    // Heuristic: >100KB/s considered "high" for MVP download/file-copy signal
    let network_high = network_bytes > 100_000;
    let disk_high = disk_activity.is_finite() && disk_activity > 40.0;

    // Conservative unknown handling per §22: unknown → protect if signals exceed lower threshold
    if is_unknown {
        if cpu_percent > 8.0 {
            return (true, format!("unknown-cpu>{} (cpu={:.1})", 8, cpu_percent));
        }
        if network_high {
            return (true, format!("unknown-network-high bytes={}", network_bytes));
        }
        if disk_high {
            return (true, format!("unknown-disk-high {:.1}", disk_activity));
        }
        // Unknown but no signal → not protected yet (still conservative: wait for signal)
        return (false, "unknown-no-signal".to_string());
    }

    // Known non-game background: cpu>10% or network/disk high → PROTECTED
    if cpu_percent > 10.0 {
        return (true, format!("cpu>{} (cpu={:.1})", 10, cpu_percent));
    }
    if network_high {
        return (true, format!("network-high bytes={}", network_bytes));
    }
    if disk_high {
        return (true, format!("disk-high {:.1}", disk_activity));
    }

    (false, "background-idle".to_string())
}

/// Full protected check wrapper (logs per §16 observer stub)
///
/// Returns true if background + protected condition holds. Foreground → false (unless game).
pub fn is_protected_activity(hwnd: u64, pid: u32, app_id: &str) -> bool {
    let info = detect_activity(pid, hwnd, app_id);
    log::info!(
        "activity.protected_check hwnd={} pid={} app_id={} state={:?} cpu={:.1} protected={} reason={} is_game={} is_unknown={}",
        hwnd,
        pid,
        app_id,
        info.state,
        info.cpu_percent,
        info.protected,
        info.reason,
        info.is_game,
        info.is_unknown
    );
    info.protected
}

/// Pure constructor for tests - inject explicit cpu/network/disk without live sampling
pub fn detect_activity_with_metrics(
    hwnd: u64,
    pid: u32,
    app_id: &str,
    cpu_percent: f32,
    network_rx: u64,
    network_tx: u64,
    disk_activity: f32,
    foreground: Option<u64>,
) -> ActivityInfo {
    let state = if hwnd == 0 {
        ActivityState::Background
    } else if let Some(fg) = foreground {
        if fg == hwnd {
            ActivityState::Foreground
        } else {
            ActivityState::Background
        }
    } else {
        get_activity_state(hwnd)
    };
    let _ = pid; // pid retained for future child-process signal

    let cpu_activity = is_cpu_active(cpu_percent);
    let (is_game, is_unknown) = category_flags(app_id);
    let (protected, reason) =
        compute_protected(state, cpu_percent, network_rx, network_tx, disk_activity, is_game, is_unknown);

    // Observer-only stub log per §16 (§48 STEP12 no optimizer trigger)
    log::info!(
        "activity.detect hwnd={} pid={} app_id={} state={:?} cpu={:.1} cpu_active={} protected={} reason={} is_game={} is_unknown={}",
        hwnd, pid, app_id, state, cpu_percent, cpu_activity, protected, reason, is_game, is_unknown
    );

    ActivityInfo {
        state,
        cpu_activity,
        protected,
        is_game,
        is_unknown,
        cpu_percent,
        reason,
    }
}

/// Live detection - §16, §15, §6, §22, §23
/// Sampling: foreground via Win32, CPU via processes::metrics, network/disk via resources stubs (0 in MVP)
pub fn detect_activity(pid: u32, hwnd: u64, app_id: &str) -> ActivityInfo {
    let cpu_percent = proc_metrics::sample_one(pid)
        .map(|m| m.cpu_percent)
        .unwrap_or(0.0);
    let (network_rx, network_tx) = network::sample_network();
    let disk_activity = disk::sample_disk();
    detect_activity_with_metrics(
        hwnd,
        pid,
        app_id,
        cpu_percent,
        network_rx,
        network_tx,
        disk_activity,
        None,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::applications::descriptor::{AppDescriptor, AppSource, AppCategory};
    use crate::applications::discovery::stable_id;

    fn game_app_id() -> String {
        // Discovery categorizes valorant/steam/minecraft as Game
        let desc = crate::applications::registry::get_all()
            .into_iter()
            .find(|d| d.category == AppCategory::Game)
            .unwrap_or(AppDescriptor {
                id: stable_id("Valorant", Some("C:\\Valorant\\valorant.exe")),
                name: "Valorant".to_string(),
                executable_path: Some("C:\\Valorant\\valorant.exe".to_string()),
                icon_ref: None,
                source: AppSource::Windows,
                category: AppCategory::Game,
                supported: true,
                unsupported_reason: None,
            });
        desc.id
    }

    fn known_browser_app_id() -> String {
        crate::applications::registry::get_all()
            .into_iter()
            .find(|d| d.category == AppCategory::Browser)
            .map(|d| d.id)
            .unwrap_or_else(|| stable_id("Chrome", Some("C:\\chrome.exe")))
    }

    #[test]
    fn foreground_not_protected_if_not_game() {
        let app_id = known_browser_app_id();
        // Simulate foreground by passing foreground == hwnd
        let hwnd = 12345u64;
        let info = detect_activity_with_metrics(hwnd, 9999, &app_id, 2.0, 0, 0, 0.0, Some(hwnd));
        assert_eq!(info.state, ActivityState::Foreground);
        assert!(!info.protected, "foreground non-game must not be protected, got {:?}", info);
        assert!(!info.is_game);
        assert_eq!(info.reason, "foreground-active");
    }

    #[test]
    fn background_high_cpu_protected() {
        let app_id = known_browser_app_id();
        let hwnd = 99999u64;
        // background (foreground != hwnd), cpu 15 >10 → protected
        let info = detect_activity_with_metrics(hwnd, 1111, &app_id, 15.0, 0, 0, 0.0, Some(1));
        assert_eq!(info.state, ActivityState::Background);
        assert!(info.protected);
        assert!(info.cpu_activity);
    }

    #[test]
    fn game_protected_even_background_and_even_foreground() {
        let app_id = game_app_id();
        let hwnd = 55555u64;
        // background game
        let bg = detect_activity_with_metrics(hwnd, 2222, &app_id, 0.5, 0, 0, 0.0, Some(1));
        assert!(bg.is_game);
        assert!(bg.protected, "game background must be protected");

        // foreground game - also protected per §23
        let fg = detect_activity_with_metrics(hwnd, 2222, &app_id, 0.5, 0, 0, 0.0, Some(hwnd));
        assert_eq!(fg.state, ActivityState::Foreground);
        assert!(fg.is_game);
        assert!(fg.protected, "game foreground must be protected (game-protected)");
    }

    #[test]
    fn unknown_conservative_cpu_threshold() {
        // Unknown app_id (missing) → is_unknown true
        let unknown_id = "app-unknown-conservative-test-xyz";
        // cpu 9 >8 → protected (unknown threshold 8)
        let high = detect_activity_with_metrics(77777, 3333, unknown_id, 9.0, 0, 0, 0.0, Some(1));
        assert!(high.is_unknown);
        assert!(high.protected, "unknown cpu>8 must be protected, cpu=9");

        // cpu 7 → not protected (below unknown threshold)
        let low = detect_activity_with_metrics(77777, 3333, unknown_id, 7.0, 0, 0, 0.0, Some(1));
        assert!(!low.protected, "unknown cpu=7 should not be protected");

        // known non-game cpu 9 → NOT protected (needs >10)
        let known_id = known_browser_app_id();
        let known_9 = detect_activity_with_metrics(77777, 3333, &known_id, 9.0, 0, 0, 0.0, Some(1));
        assert!(!known_9.is_unknown);
        assert!(!known_9.protected, "known non-game cpu=9 needs >10");
        let known_11 = detect_activity_with_metrics(77777, 3333, &known_id, 11.0, 0, 0, 0.0, Some(1));
        assert!(known_11.protected, "known cpu>10 must be protected");
    }

    #[test]
    fn cpu_activity_flag_threshold_5() {
        assert!(!is_cpu_active(5.0));
        assert!(is_cpu_active(5.1));
        assert!(is_cpu_active(15.0));
        assert!(!is_cpu_active(0.0));
    }

    #[test]
    fn is_game_and_unknown_flags() {
        let game_id = game_app_id();
        assert!(is_game_category(&game_id));
        assert!(!is_unknown_category(&game_id));

        let browser_id = known_browser_app_id();
        assert!(!is_game_category(&browser_id));
        assert!(!is_unknown_category(&browser_id));

        let unknown = "app-nonexistent-12345";
        assert!(!is_game_category(unknown));
        assert!(is_unknown_category(unknown));
        assert!(is_unknown_category(""));
    }
}
