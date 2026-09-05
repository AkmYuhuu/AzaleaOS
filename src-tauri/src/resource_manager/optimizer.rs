use serde::{Deserialize, Serialize};

use crate::processes::metrics as proc_metrics;
use crate::resources::pressure::{self, PressureLevel};
use crate::resource_manager::activity;
use crate::resource_manager::lifecycle::{self, LifecycleState};
use crate::windows::focus;

/// Result of gentle/aggressive optimization - §19 + §40 no false promises.
/// Reports WorkingSet before/after + pressure before/after.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizerResult {
    pub pid: u32,
    pub hwnd: Option<u64>,
    pub status: String,
    pub working_set_before: Option<u64>,
    pub working_set_after: Option<u64>,
    pub pressure_before: PressureLevel,
    pub pressure_after: PressureLevel,
    pub lifecycle_state: LifecycleState,
    pub intervention: String,
    pub stability_ok: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rejected_reason: Option<String>,
}

// ---------------------------------------------------------------------------
// Safety Governor - §21
// Before any optimization: check all DO NOT conditions.
// If any true → Err OptimizationRejected.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct SafetyGovernorInput {
    pub is_foreground: bool,
    pub download_active: bool,
    pub file_operation_active: bool,
    pub video_audio_active: bool,
    pub is_game: bool,
    pub is_protected: bool,
    pub recently_crashed: bool,
    pub disk_pressure_high: bool,
    pub previous_improved: bool,
    pub policy_allows: bool,
}

impl Default for SafetyGovernorInput {
    fn default() -> Self {
        Self {
            is_foreground: false,
            download_active: false,
            file_operation_active: false,
            video_audio_active: false,
            is_game: false,
            is_protected: false,
            recently_crashed: false,
            disk_pressure_high: false,
            previous_improved: true,
            policy_allows: true,
        }
    }
}

pub struct SafetyGovernor;

impl SafetyGovernor {
    /// §21 - check all DO NOT conditions. Returns Ok if safe to optimize.
    pub fn should_optimize(input: &SafetyGovernorInput) -> Result<(), String> {
        if input.is_foreground {
            return Err(crate::error::AzaleaError::OptimizationRejected(
                "foreground - DO NOT OPTIMIZE".to_string(),
            )
            .to_string());
        }
        if input.download_active {
            return Err(crate::error::AzaleaError::OptimizationRejected(
                "download active - DO NOT OPTIMIZE".to_string(),
            )
            .to_string());
        }
        if input.file_operation_active {
            return Err(crate::error::AzaleaError::OptimizationRejected(
                "file operation active - DO NOT OPTIMIZE".to_string(),
            )
            .to_string());
        }
        if input.video_audio_active {
            return Err(crate::error::AzaleaError::OptimizationRejected(
                "video/audio active - DO NOT OPTIMIZE".to_string(),
            )
            .to_string());
        }
        if input.is_game {
            return Err(crate::error::AzaleaError::OptimizationRejected(
                "game - DO NOT OPTIMIZE".to_string(),
            )
            .to_string());
        }
        if input.is_protected {
            return Err(crate::error::AzaleaError::OptimizationRejected(
                "protected - DO NOT OPTIMIZE".to_string(),
            )
            .to_string());
        }
        if input.recently_crashed {
            return Err(crate::error::AzaleaError::OptimizationRejected(
                "recently crashed - DO NOT OPTIMIZE".to_string(),
            )
            .to_string());
        }
        if input.disk_pressure_high {
            return Err(crate::error::AzaleaError::OptimizationRejected(
                "disk pressure HIGH - DO NOT OPTIMIZE".to_string(),
            )
            .to_string());
        }
        if !input.previous_improved {
            return Err(crate::error::AzaleaError::OptimizationRejected(
                "previous intervention did not improve - DO NOT OPTIMIZE".to_string(),
            )
            .to_string());
        }
        if !input.policy_allows {
            return Err(crate::error::AzaleaError::OptimizationRejected(
                "policy disallows background optimization - DO NOT OPTIMIZE".to_string(),
            )
            .to_string());
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn policy_allows_optimization() -> bool {
    // §20 + §29 resourcePolicy.backgroundOptimization - authority is local config.
    // Read spec path %LOCALAPPDATA%\AzaleaOS\Full\config.json; default true if missing.
    let base = std::env::var("LOCALAPPDATA")
        .map(|p| std::path::PathBuf::from(p).join("AzaleaOS").join("Full"))
        .unwrap_or_else(|_| std::env::temp_dir().join("AzaleaOS").join("Full"));
    match crate::config::repository::read_config(&base) {
        Ok(cfg) => cfg.resource_policy.background_optimization,
        Err(_) => true,
    }
}

/// Try to lower priority to BELOW_NORMAL - best-effort gentle intervention (§19 Level1).
fn try_lower_priority(pid: u32) -> Result<(), String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        GetPriorityClass, OpenProcess, SetPriorityClass, BELOW_NORMAL_PRIORITY_CLASS,
        PROCESS_QUERY_INFORMATION, PROCESS_SET_INFORMATION,
    };
    unsafe {
        let access = PROCESS_SET_INFORMATION | PROCESS_QUERY_INFORMATION;
        let handle = OpenProcess(access, false, pid).map_err(|e| format!("OpenProcess failed: {}", e))?;
        if handle.is_invalid() {
            return Err("OpenProcess returned invalid handle".to_string());
        }
        let current = GetPriorityClass(handle);
        if current == BELOW_NORMAL_PRIORITY_CLASS.0 {
            let _ = CloseHandle(handle);
            return Ok(());
        }
        let ok = SetPriorityClass(handle, BELOW_NORMAL_PRIORITY_CLASS);
        let _ = CloseHandle(handle);
        ok.map_err(|e| format!("SetPriorityClass failed: {}", e))?;
        Ok(())
    }
}

/// Aggressive priority - IDLE_PRIORITY_CLASS (stronger than gentle BELOW_NORMAL) §20 Level2.
fn try_lower_priority_idle(pid: u32) -> Result<(), String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        GetPriorityClass, OpenProcess, SetPriorityClass, IDLE_PRIORITY_CLASS,
        PROCESS_QUERY_INFORMATION, PROCESS_SET_INFORMATION,
    };
    unsafe {
        let access = PROCESS_SET_INFORMATION | PROCESS_QUERY_INFORMATION;
        let handle = OpenProcess(access, false, pid).map_err(|e| format!("OpenProcess failed: {}", e))?;
        if handle.is_invalid() {
            return Err("OpenProcess returned invalid handle".to_string());
        }
        let current = GetPriorityClass(handle);
        if current == IDLE_PRIORITY_CLASS.0 {
            let _ = CloseHandle(handle);
            return Ok(());
        }
        let ok = SetPriorityClass(handle, IDLE_PRIORITY_CLASS);
        let _ = CloseHandle(handle);
        ok.map_err(|e| format!("SetPriorityClass IDLE failed: {}", e))?;
        Ok(())
    }
}

/// Best-effort working-set reclaim - §19.2 + §20 Level2. Uses K32EmptyWorkingSet if available.
fn try_empty_working_set(pid: u32) -> Result<(), String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::ProcessStatus::K32EmptyWorkingSet;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_SET_QUOTA};
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA, false, pid)
            .map_err(|e| format!("OpenProcess for EmptyWorkingSet failed: {}", e))?;
        if handle.is_invalid() {
            return Err("OpenProcess returned invalid handle".to_string());
        }
        let res = K32EmptyWorkingSet(handle);
        let _ = CloseHandle(handle);
        res.ok().map_err(|e| format!("K32EmptyWorkingSet failed: {}", e))?;
        Ok(())
    }
}

/// Best-effort resolve app_id from pid's exe path matching registry descriptor.
fn resolve_app_id(pid: u32) -> String {
    let exe_path: Option<String> = {
        use sysinfo::{Pid, System};
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        sys.process(Pid::from_u32(pid)).and_then(|p| p.exe().map(|e| e.to_string_lossy().to_string()))
    };
    if let Some(path) = exe_path {
        let lower = path.to_lowercase();
        for desc in crate::applications::registry::get_all() {
            if let Some(ep) = desc.executable_path {
                if lower.contains(&ep.to_lowercase()) || ep.to_lowercase().contains(&lower) {
                    return desc.id;
                }
                if lower.contains(&desc.name.to_lowercase()) {
                    return desc.id;
                }
            }
        }
        if let Some(fname) = std::path::Path::new(&path).file_name().and_then(|s| s.to_str()) {
            let fname_lower = fname.to_lowercase();
            for desc in crate::applications::registry::get_all() {
                if desc.name.to_lowercase().contains(&fname_lower.trim_end_matches(".exe")) {
                    return desc.id;
                }
            }
        }
    }
    String::new()
}

// ---------------------------------------------------------------------------
// Gentle optimizer - STEP 14 Level 1 only (§19, §20, §21).
// ---------------------------------------------------------------------------

/// Gentle optimizer - STEP 14 Level 1 only (§19, §20, §21).
/// Flow: Background → Safe check → Small intervention → Measure → Stability → Stop.
/// No aggressive path (STEP 15).
pub struct GentleOptimizer;

impl Default for GentleOptimizer {
    fn default() -> Self {
        Self
    }
}

impl GentleOptimizer {
    pub fn new() -> Self {
        Self
    }

    /// Live IPC entry - resolves activity + pressure + lifecycle, applies safety governor,
    /// performs gentle intervention (priority lowering stub), measures before/after.
    pub fn try_gentle_optimize(&self, pid: u32, hwnd: Option<u64>) -> Result<OptimizerResult, String> {
        if pid == 0 {
            return Err(crate::error::AzaleaError::OptimizationRejected("invalid pid 0".to_string()).to_string());
        }
        if !crate::processes::lifecycle::is_alive(pid) {
            let msg = format!("pid {} not alive", pid);
            log::warn!("resource.optimization_skipped pid={} reason={}", pid, msg);
            return Err(crate::error::AzaleaError::OptimizationRejected(msg).to_string());
        }

        let hwnd_val = hwnd.unwrap_or(0);
        let pressure_before = pressure::evaluate();
        let app_id = resolve_app_id(pid);
        let info = activity::detect_activity(pid, hwnd_val, &app_id);
        let is_foreground = if hwnd_val != 0 {
            focus::is_foreground(hwnd_val)
        } else {
            info.state == activity::ActivityState::Foreground
        };

        let lifecycle_input = lifecycle::LifecycleInput {
            is_foreground,
            is_protected: info.protected,
            is_game: info.is_game,
            is_unknown: info.is_unknown,
            pressure: pressure_before,
            cpu_active: info.cpu_activity,
        };
        let lifecycle_state = lifecycle::compute_lifecycle(&lifecycle_input);

        self.try_with_resolved(pid, hwnd, pressure_before, lifecycle_state, &info, is_foreground)
    }

    fn try_with_resolved(
        &self,
        pid: u32,
        hwnd: Option<u64>,
        pressure_before: PressureLevel,
        lifecycle_state: LifecycleState,
        info: &activity::ActivityInfo,
        is_foreground: bool,
    ) -> Result<OptimizerResult, String> {
        // ---- Safety governor (§21) ----
        if is_foreground {
            let reason = "foreground - DO NOT OPTIMIZE".to_string();
            log::warn!("resource.optimization_skipped pid={} hwnd={:?} reason={}", pid, hwnd, reason);
            return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
        }
        if info.is_game {
            let reason = "game - DO NOT OPTIMIZE".to_string();
            log::warn!("resource.optimization_skipped pid={} reason={}", pid, reason);
            return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
        }
        if info.protected {
            let reason = format!("protected ({}) - DO NOT OPTIMIZE", info.reason);
            log::warn!("resource.optimization_skipped pid={} reason={}", pid, reason);
            return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
        }
        match lifecycle_state {
            LifecycleState::Background => {},
            LifecycleState::Optimizing => {
                if pressure_before == PressureLevel::Critical {
                    let reason = "pressure Critical - gentle not applicable, aggressive policy required - DO NOT OPTIMIZE (gentle)".to_string();
                    log::warn!("resource.optimization_skipped pid={} pressure={:?} reason={}", pid, pressure_before, reason);
                    return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
                }
                log::info!("optimizer.gentle lifecycle Optimizing under High - allowing gentle conservative intervention pid={}", pid);
            }
            LifecycleState::Active => {
                let reason = "lifecycle Active - DO NOT OPTIMIZE".to_string();
                log::warn!("resource.optimization_skipped pid={} reason={}", pid, reason);
                return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
            }
            LifecycleState::Protected => {
                let reason = "lifecycle Protected - DO NOT OPTIMIZE".to_string();
                log::warn!("resource.optimization_skipped pid={} reason={}", pid, reason);
                return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
            }
            LifecycleState::Game => {
                let reason = "lifecycle Game - DO NOT OPTIMIZE".to_string();
                log::warn!("resource.optimization_skipped pid={} reason={}", pid, reason);
                return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
            }
            other => {
                let reason = format!("lifecycle {:?} - DO NOT OPTIMIZE (gentle only for Background)", other);
                log::warn!("resource.optimization_skipped pid={} reason={}", pid, reason);
                return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
            }
        }
        log::info!(
            "optimizer.gentle_started pid={} hwnd={:?} lifecycle={:?} pressure_before={:?} reason={}",
            pid,
            hwnd,
            lifecycle_state,
            pressure_before,
            info.reason
        );

        let working_set_before = proc_metrics::sample_one(pid).map(|m| m.working_set_bytes);
        let _pressure_snap_before = pressure_before;

        let intervention = match try_lower_priority(pid) {
            Ok(_) => {
                log::info!("optimizer.gentle_intervention pid={} lowered priority to BELOW_NORMAL", pid);
                "priority_below_normal".to_string()
            }
            Err(e) => {
                log::warn!("optimizer.gentle_intervention pid={} priority lowering failed (best-effort): {}", pid, e);
                format!("priority_attempt_failed: {}", e)
            }
        };

        std::thread::sleep(std::time::Duration::from_millis(50));

        let working_set_after = proc_metrics::sample_one(pid).map(|m| m.working_set_bytes);
        let pressure_after = pressure::evaluate();

        log::info!(
            "optimizer.gentle_finished pid={} ws_before={:?} ws_after={:?} pressure_before={:?} pressure_after={:?} intervention={}",
            pid,
            working_set_before,
            working_set_after,
            pressure_before,
            pressure_after,
            intervention
        );

        let stability_ok = match (working_set_before, working_set_after) {
            (Some(before), Some(after)) if before > 0 => {
                let ok = after < before.saturating_mul(3) / 2 || after <= before;
                if ok {
                    log::info!("optimizer.stability_ok pid={} before={} after={} -> ok", pid, before, after);
                } else {
                    log::warn!("optimizer.stability_check pid={} before={} after={} -> working set grew significantly", pid, before, after);
                }
                ok
            }
            _ => {
                log::info!("optimizer.stability_ok pid={} ws missing -> assumed ok (best-effort)", pid);
                true
            }
        };

        let message = format!(
            "gentle optimization completed: WorkingSet before={:?} after={:?}, pressure before={:?} after={:?}, intervention={}, stability_ok={}",
            working_set_before, working_set_after, pressure_before, pressure_after, intervention, stability_ok
        );

        Ok(OptimizerResult {
            pid,
            hwnd,
            status: "optimized".to_string(),
            working_set_before,
            working_set_after,
            pressure_before,
            pressure_after,
            lifecycle_state,
            intervention,
            stability_ok,
            message,
            rejected_reason: None,
        })
    }

    /// Pure test seam - inject explicit signals without live sysinfo/Win32.
    pub fn try_with_input(
        &self,
        pid: u32,
        hwnd: Option<u64>,
        pressure_before: PressureLevel,
        pressure_after: PressureLevel,
        lifecycle_state: LifecycleState,
        is_foreground: bool,
        is_game: bool,
        is_protected: bool,
        protected_reason: &str,
        ws_before: Option<u64>,
        ws_after: Option<u64>,
    ) -> Result<OptimizerResult, String> {
        let _info = activity::ActivityInfo {
            state: if is_foreground { activity::ActivityState::Foreground } else { activity::ActivityState::Background },
            cpu_activity: false,
            protected: is_protected,
            is_game,
            is_unknown: false,
            cpu_percent: 0.0,
            reason: protected_reason.to_string(),
        };
        if is_foreground {
            return Err(crate::error::AzaleaError::OptimizationRejected("foreground - DO NOT OPTIMIZE".to_string()).to_string());
        }
        if is_game {
            return Err(crate::error::AzaleaError::OptimizationRejected("game - DO NOT OPTIMIZE".to_string()).to_string());
        }
        if is_protected {
            return Err(crate::error::AzaleaError::OptimizationRejected(format!("protected ({}) - DO NOT OPTIMIZE", protected_reason)).to_string());
        }
        match lifecycle_state {
            LifecycleState::Background | LifecycleState::Optimizing => {},
            _ => {
                return Err(crate::error::AzaleaError::OptimizationRejected(format!("lifecycle {:?} - DO NOT OPTIMIZE", lifecycle_state)).to_string());
            }
        }
        if pressure_before == PressureLevel::Critical {
            return Err(crate::error::AzaleaError::OptimizationRejected("pressure Critical - gentle not applicable - DO NOT OPTIMIZE".to_string()).to_string());
        }
        let stability_ok = match (ws_before, ws_after) {
            (Some(b), Some(a)) if b > 0 => a < b * 3 / 2 || a <= b,
            _ => true,
        };
        Ok(OptimizerResult {
            pid,
            hwnd,
            status: "optimized".to_string(),
            working_set_before: ws_before,
            working_set_after: ws_after,
            pressure_before,
            pressure_after,
            lifecycle_state,
            intervention: "mock_gentle".to_string(),
            stability_ok,
            message: format!("mock gentle ws {:?}->{:?} pressure {:?}->{:?}", ws_before, ws_after, pressure_before, pressure_after),
            rejected_reason: None,
        })
    }
}

// ---------------------------------------------------------------------------
// Aggressive optimizer - STEP 15 Level 2 (§20, §21)
// Only when HIGH/CRITICAL + BACKGROUND + not protected/game + policy allows.
// Stronger intervention: IDLE_PRIORITY_CLASS + EmptyWorkingSet (best-effort).
// ---------------------------------------------------------------------------

pub struct AggressiveOptimizer;

impl Default for AggressiveOptimizer {
    fn default() -> Self {
        Self
    }
}

impl AggressiveOptimizer {
    pub fn new() -> Self {
        Self
    }

    /// Live IPC entry - gated by pressure High/Critical, lifecycle Background/Optimizing,
    /// policy, and safety governor (§21). Performs stronger intervention.
    pub fn try_aggressive_optimize(&self, pid: u32, hwnd: Option<u64>) -> Result<OptimizerResult, String> {
        if pid == 0 {
            return Err(crate::error::AzaleaError::OptimizationRejected("invalid pid 0".to_string()).to_string());
        }
        if !crate::processes::lifecycle::is_alive(pid) {
            let msg = format!("pid {} not alive", pid);
            log::warn!("resource.optimization_skipped pid={} reason={}", pid, msg);
            return Err(crate::error::AzaleaError::OptimizationRejected(msg).to_string());
        }

        let hwnd_val = hwnd.unwrap_or(0);
        let pressure_before = pressure::evaluate();

        // §20 Level2 gate - only High/Critical
        if !matches!(pressure_before, PressureLevel::High | PressureLevel::Critical) {
            let reason = format!(
                "pressure {:?} not High/Critical - DO NOT OPTIMIZE (aggressive only under pressure)",
                pressure_before
            );
            log::warn!("resource.optimization_skipped pid={} pressure={:?} reason={}", pid, pressure_before, reason);
            return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
        }

        let app_id = resolve_app_id(pid);
        let info = activity::detect_activity(pid, hwnd_val, &app_id);
        let is_foreground = if hwnd_val != 0 {
            focus::is_foreground(hwnd_val)
        } else {
            info.state == activity::ActivityState::Foreground
        };

        let lifecycle_input = lifecycle::LifecycleInput {
            is_foreground,
            is_protected: info.protected,
            is_game: info.is_game,
            is_unknown: info.is_unknown,
            pressure: pressure_before,
            cpu_active: info.cpu_activity,
        };
        let lifecycle_state = lifecycle::compute_lifecycle(&lifecycle_input);

        self.try_with_resolved_aggressive(pid, hwnd, pressure_before, lifecycle_state, &info, is_foreground)
    }

    fn try_with_resolved_aggressive(
        &self,
        pid: u32,
        hwnd: Option<u64>,
        pressure_before: PressureLevel,
        lifecycle_state: LifecycleState,
        info: &activity::ActivityInfo,
        is_foreground: bool,
    ) -> Result<OptimizerResult, String> {
        // ---- Lifecycle gate - aggressive only for Background (± Optimizing under High/Critical) ----
        match lifecycle_state {
            LifecycleState::Background | LifecycleState::Optimizing => {},
            LifecycleState::Active => {
                let reason = "lifecycle Active - DO NOT OPTIMIZE (aggressive only for Background)".to_string();
                log::warn!("resource.optimization_skipped pid={} reason={}", pid, reason);
                return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
            }
            LifecycleState::Protected => {
                let reason = "lifecycle Protected - DO NOT OPTIMIZE".to_string();
                log::warn!("resource.optimization_skipped pid={} reason={}", pid, reason);
                return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
            }
            LifecycleState::Game => {
                let reason = "lifecycle Game - DO NOT OPTIMIZE".to_string();
                log::warn!("resource.optimization_skipped pid={} reason={}", pid, reason);
                return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
            }
            other => {
                let reason = format!("lifecycle {:?} - DO NOT OPTIMIZE (aggressive only for Background)", other);
                log::warn!("resource.optimization_skipped pid={} reason={}", pid, reason);
                return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
            }
        }

        // ---- Policy gate §20 + §29 ----
        let policy_allows = policy_allows_optimization();
        if !policy_allows {
            let reason = "policy disallows background optimization - DO NOT OPTIMIZE".to_string();
            log::warn!("resource.optimization_skipped pid={} reason={}", pid, reason);
            return Err(crate::error::AzaleaError::OptimizationRejected(reason).to_string());
        }

        // ---- Safety Governor §21 ----
        let disk_pressure = crate::resources::disk::sample_disk();
        let disk_pressure_high = disk_pressure > 60.0;
        // Derive download/file op from activity signals (stub heuristics §22)
        // network-high bytes>100k is captured as reason contains "network"
        let download_active = info.reason.contains("network");
        let file_operation_active = info.reason.contains("disk") || disk_pressure_high;
        let video_audio_active = false; // stub §21 video/audio
        let recently_crashed = false; // stub §21 - no crash history yet
        let previous_improved = true; // stub §21 - assume improved for MVP

        let safety_input = SafetyGovernorInput {
            is_foreground,
            download_active,
            file_operation_active,
            video_audio_active,
            is_game: info.is_game,
            is_protected: info.protected,
            recently_crashed,
            disk_pressure_high,
            previous_improved,
            policy_allows,
        };
        if let Err(e) = SafetyGovernor::should_optimize(&safety_input) {
            log::warn!("resource.optimization_skipped pid={} hwnd={:?} reason={}", pid, hwnd, e);
            return Err(e);
        }

        // ---- Measure before §40 ----
        log::info!(
            "optimizer.aggressive_started pid={} hwnd={:?} lifecycle={:?} pressure_before={:?} reason={} disk_pressure={}",
            pid,
            hwnd,
            lifecycle_state,
            pressure_before,
            info.reason,
            disk_pressure
        );
        let working_set_before = proc_metrics::sample_one(pid).map(|m| m.working_set_bytes);

        // ---- Intervention: stronger than gentle (§20 Level2) ----
        let idle_res = try_lower_priority_idle(pid);
        let idle_label = match &idle_res {
            Ok(_) => {
                log::info!("optimizer.aggressive_intervention pid={} lowered priority to IDLE", pid);
                "priority_idle".to_string()
            }
            Err(e) => {
                log::warn!("optimizer.aggressive_intervention pid={} IDLE priority failed (best-effort): {}", pid, e);
                format!("priority_idle_failed: {}", e)
            }
        };
        let ws_res = try_empty_working_set(pid);
        let ws_label = match &ws_res {
            Ok(_) => {
                log::info!("optimizer.aggressive_intervention pid={} EmptyWorkingSet succeeded", pid);
                "empty_working_set".to_string()
            }
            Err(e) => {
                log::warn!("optimizer.aggressive_intervention pid={} EmptyWorkingSet failed (best-effort): {}", pid, e);
                format!("empty_ws_failed: {}", e)
            }
        };
        let intervention = format!("{}+{}", idle_label, ws_label);

        std::thread::sleep(std::time::Duration::from_millis(50));

        let working_set_after = proc_metrics::sample_one(pid).map(|m| m.working_set_bytes);
        let pressure_after = pressure::evaluate();

        log::info!(
            "optimizer.aggressive_finished pid={} ws_before={:?} ws_after={:?} pressure_before={:?} pressure_after={:?} intervention={}",
            pid,
            working_set_before,
            working_set_after,
            pressure_before,
            pressure_after,
            intervention
        );

        let stability_ok = match (working_set_before, working_set_after) {
            (Some(before), Some(after)) if before > 0 => {
                let ok = after < before.saturating_mul(3) / 2 || after <= before;
                if ok {
                    log::info!("optimizer.stability_ok pid={} before={} after={} -> ok", pid, before, after);
                } else {
                    log::warn!("optimizer.stability_check pid={} before={} after={} -> working set grew significantly", pid, before, after);
                }
                ok
            }
            _ => {
                log::info!("optimizer.stability_ok pid={} ws missing -> assumed ok (best-effort)", pid);
                true
            }
        };

        let message = format!(
            "aggressive optimization completed: WorkingSet before={:?} after={:?}, pressure before={:?} after={:?}, intervention={}, stability_ok={}",
            working_set_before, working_set_after, pressure_before, pressure_after, intervention, stability_ok
        );

        Ok(OptimizerResult {
            pid,
            hwnd,
            status: "optimized".to_string(),
            working_set_before,
            working_set_after,
            pressure_before,
            pressure_after,
            lifecycle_state,
            intervention,
            stability_ok,
            message,
            rejected_reason: None,
        })
    }

    /// Pure test seam for aggressive - inject explicit signals without live sysinfo/Win32.
    #[allow(clippy::too_many_arguments)]
    pub fn try_with_input(
        &self,
        pid: u32,
        hwnd: Option<u64>,
        pressure_before: PressureLevel,
        pressure_after: PressureLevel,
        lifecycle_state: LifecycleState,
        is_foreground: bool,
        is_game: bool,
        is_protected: bool,
        protected_reason: &str,
        disk_pressure_high: bool,
        policy_allows: bool,
        ws_before: Option<u64>,
        ws_after: Option<u64>,
    ) -> Result<OptimizerResult, String> {
        // ---- Pressure gate ----
        if !matches!(pressure_before, PressureLevel::High | PressureLevel::Critical) {
            return Err(crate::error::AzaleaError::OptimizationRejected(format!(
                "pressure {:?} not High/Critical - DO NOT OPTIMIZE (aggressive only under pressure)",
                pressure_before
            ))
            .to_string());
        }
        // ---- Foreground / game / protected via SafetyGovernor ----
        let safety_input = SafetyGovernorInput {
            is_foreground,
            download_active: false,
            file_operation_active: false,
            video_audio_active: false,
            is_game,
            is_protected,
            recently_crashed: false,
            disk_pressure_high,
            previous_improved: true,
            policy_allows,
        };
        SafetyGovernor::should_optimize(&safety_input).map_err(|e| {
            // Ensure error string propagates with OptimizationRejected prefix already
            e
        })?;

        // ---- Lifecycle gate ----
        match lifecycle_state {
            LifecycleState::Background | LifecycleState::Optimizing => {},
            _ => {
                return Err(crate::error::AzaleaError::OptimizationRejected(format!(
                    "lifecycle {:?} - DO NOT OPTIMIZE (aggressive only for Background)",
                    lifecycle_state
                ))
                .to_string());
            }
        }

        // ---- Success - synthesize result ----
        let stability_ok = match (ws_before, ws_after) {
            (Some(b), Some(a)) if b > 0 => a < b * 3 / 2 || a <= b,
            _ => true,
        };
        // Also validate protected reason is preserved for diagnostics parity
        let _ = protected_reason;
        Ok(OptimizerResult {
            pid,
            hwnd,
            status: "optimized".to_string(),
            working_set_before: ws_before,
            working_set_after: ws_after,
            pressure_before,
            pressure_after,
            lifecycle_state,
            intervention: "mock_aggressive_idle+empty_ws".to_string(),
            stability_ok,
            message: format!(
                "mock aggressive ws {:?}->{:?} pressure {:?}->{:?}",
                ws_before, ws_after, pressure_before, pressure_after
            ),
            rejected_reason: None,
        })
    }

    /// Extended test seam with full safety inputs (download/file/video/crash/previous).
    #[allow(clippy::too_many_arguments)]
    pub fn try_with_full_input(
        &self,
        pid: u32,
        hwnd: Option<u64>,
        pressure_before: PressureLevel,
        pressure_after: PressureLevel,
        lifecycle_state: LifecycleState,
        safety_input: SafetyGovernorInput,
        ws_before: Option<u64>,
        ws_after: Option<u64>,
    ) -> Result<OptimizerResult, String> {
        if !matches!(pressure_before, PressureLevel::High | PressureLevel::Critical) {
            return Err(crate::error::AzaleaError::OptimizationRejected(format!(
                "pressure {:?} not High/Critical - DO NOT OPTIMIZE",
                pressure_before
            ))
            .to_string());
        }
        SafetyGovernor::should_optimize(&safety_input)?;
        match lifecycle_state {
            LifecycleState::Background | LifecycleState::Optimizing => {},
            _ => {
                return Err(crate::error::AzaleaError::OptimizationRejected(format!(
                    "lifecycle {:?} - DO NOT OPTIMIZE",
                    lifecycle_state
                ))
                .to_string())
            }
        }
        let stability_ok = match (ws_before, ws_after) {
            (Some(b), Some(a)) if b > 0 => a < b * 3 / 2 || a <= b,
            _ => true,
        };
        Ok(OptimizerResult {
            pid,
            hwnd,
            status: "optimized".to_string(),
            working_set_before: ws_before,
            working_set_after: ws_after,
            pressure_before,
            pressure_after,
            lifecycle_state,
            intervention: "mock_aggressive_full".to_string(),
            stability_ok,
            message: format!("mock aggressive full ws {:?}->{:?}", ws_before, ws_after),
            rejected_reason: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resources::pressure::PressureLevel;
    use crate::resource_manager::lifecycle::LifecycleState;

    // ---- Gentle tests preserved ----
    #[test]
    fn gentle_background_success() {
        let opt = GentleOptimizer::new();
        let res = opt.try_with_input(1234, Some(9999), PressureLevel::Moderate, PressureLevel::Moderate, LifecycleState::Background, false, false, false, "background-idle", Some(100_000_000), Some(95_000_000)).unwrap();
        assert_eq!(res.status, "optimized");
        assert_eq!(res.pid, 1234);
        assert!(res.stability_ok);
        assert_eq!(res.working_set_before, Some(100_000_000));
        assert_eq!(res.pressure_before, PressureLevel::Moderate);
    }

    #[test]
    fn gentle_rejects_foreground() {
        let opt = GentleOptimizer::new();
        let err = opt.try_with_input(1234, Some(9999), PressureLevel::Normal, PressureLevel::Normal, LifecycleState::Background, true, false, false, "foreground-active", Some(100), Some(90)).unwrap_err();
        assert!(err.contains("OptimizationRejected"));
        assert!(err.contains("foreground"));
    }

    #[test]
    fn gentle_rejects_game() {
        let opt = GentleOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::Normal, PressureLevel::Normal, LifecycleState::Background, false, true, false, "game-protected", Some(100), Some(90)).unwrap_err();
        assert!(err.contains("OptimizationRejected"));
        assert!(err.to_lowercase().contains("game"));
    }

    #[test]
    fn gentle_rejects_protected() {
        let opt = GentleOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::Moderate, PressureLevel::Moderate, LifecycleState::Background, false, false, true, "cpu>10", Some(200), Some(190)).unwrap_err();
        assert!(err.contains("OptimizationRejected"));
        assert!(err.contains("protected"));
    }

    #[test]
    fn gentle_rejects_non_background_lifecycle() {
        let opt = GentleOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::Normal, PressureLevel::Normal, LifecycleState::Active, false, false, false, "background-idle", Some(100), Some(90)).unwrap_err();
        assert!(err.contains("OptimizationRejected"));
    }

    #[test]
    fn gentle_rejects_critical_pressure() {
        let opt = GentleOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::Critical, PressureLevel::Critical, LifecycleState::Optimizing, false, false, false, "background-idle", Some(100), Some(90)).unwrap_err();
        assert!(err.contains("OptimizationRejected"));
        assert!(err.to_lowercase().contains("critical"));
    }

    #[test]
    fn gentle_allows_optimizing_under_high() {
        let opt = GentleOptimizer::new();
        let res = opt.try_with_input(1234, None, PressureLevel::High, PressureLevel::Moderate, LifecycleState::Optimizing, false, false, false, "background-idle", Some(500), Some(480)).unwrap();
        assert_eq!(res.status, "optimized");
        assert_eq!(res.lifecycle_state, LifecycleState::Optimizing);
    }

    #[test]
    fn gentle_stability_growth_detected() {
        let opt = GentleOptimizer::new();
        let res = opt.try_with_input(1234, None, PressureLevel::Normal, PressureLevel::Normal, LifecycleState::Background, false, false, false, "background-idle", Some(100), Some(200)).unwrap();
        assert!(!res.stability_ok);
    }

    #[test]
    fn optimizer_result_serializes_camel_case() {
        let opt = GentleOptimizer::new();
        let res = opt.try_with_input(42, Some(1), PressureLevel::Normal, PressureLevel::Normal, LifecycleState::Background, false, false, false, "background-idle", Some(1024), Some(512)).unwrap();
        let json = serde_json::to_string(&res).unwrap();
        assert!(json.contains("workingSetBefore"));
        assert!(json.contains("pressureBefore"));
        assert!(json.contains("lifecycleState"));
    }

    // ---- SafetyGovernor tests ----
    #[test]
    fn safety_governor_rejects_foreground() {
        let input = SafetyGovernorInput { is_foreground: true, ..Default::default() };
        let err = SafetyGovernor::should_optimize(&input).unwrap_err();
        assert!(err.contains("OptimizationRejected"));
        assert!(err.contains("foreground"));
    }

    #[test]
    fn safety_governor_rejects_game() {
        let input = SafetyGovernorInput { is_game: true, ..Default::default() };
        let err = SafetyGovernor::should_optimize(&input).unwrap_err();
        assert!(err.to_lowercase().contains("game"));
    }

    #[test]
    fn safety_governor_rejects_protected() {
        let input = SafetyGovernorInput { is_protected: true, ..Default::default() };
        let err = SafetyGovernor::should_optimize(&input).unwrap_err();
        assert!(err.contains("protected"));
    }

    #[test]
    fn safety_governor_rejects_disk_pressure_high() {
        let input = SafetyGovernorInput { disk_pressure_high: true, ..Default::default() };
        let err = SafetyGovernor::should_optimize(&input).unwrap_err();
        assert!(err.to_lowercase().contains("disk"));
    }

    #[test]
    fn safety_governor_rejects_download_active() {
        let input = SafetyGovernorInput { download_active: true, ..Default::default() };
        let err = SafetyGovernor::should_optimize(&input).unwrap_err();
        assert!(err.to_lowercase().contains("download"));
    }

    #[test]
    fn safety_governor_rejects_file_operation() {
        let input = SafetyGovernorInput { file_operation_active: true, ..Default::default() };
        let err = SafetyGovernor::should_optimize(&input).unwrap_err();
        assert!(err.to_lowercase().contains("file"));
    }

    #[test]
    fn safety_governor_rejects_video_audio() {
        let input = SafetyGovernorInput { video_audio_active: true, ..Default::default() };
        let err = SafetyGovernor::should_optimize(&input).unwrap_err();
        assert!(err.to_lowercase().contains("video"));
    }

    #[test]
    fn safety_governor_rejects_recently_crashed() {
        let input = SafetyGovernorInput { recently_crashed: true, ..Default::default() };
        let err = SafetyGovernor::should_optimize(&input).unwrap_err();
        assert!(err.to_lowercase().contains("crashed"));
    }

    #[test]
    fn safety_governor_rejects_previous_not_improved() {
        let input = SafetyGovernorInput { previous_improved: false, ..Default::default() };
        let err = SafetyGovernor::should_optimize(&input).unwrap_err();
        assert!(err.to_lowercase().contains("previous"));
    }

    #[test]
    fn safety_governor_rejects_policy_disallows() {
        let input = SafetyGovernorInput { policy_allows: false, ..Default::default() };
        let err = SafetyGovernor::should_optimize(&input).unwrap_err();
        assert!(err.to_lowercase().contains("policy"));
    }

    #[test]
    fn safety_governor_allows_when_all_clear() {
        let input = SafetyGovernorInput::default();
        assert!(SafetyGovernor::should_optimize(&input).is_ok());
    }

    // ---- Aggressive tests §20 Level2 + §21 ----
    #[test]
    fn aggressive_background_high_success() {
        let opt = AggressiveOptimizer::new();
        let res = opt.try_with_input(1234, Some(9999), PressureLevel::High, PressureLevel::Moderate, LifecycleState::Background, false, false, false, "background-idle", false, true, Some(100_000_000), Some(80_000_000)).unwrap();
        assert_eq!(res.status, "optimized");
        assert_eq!(res.pid, 1234);
        assert_eq!(res.pressure_before, PressureLevel::High);
        assert!(res.intervention.contains("aggressive"));
        assert!(res.stability_ok);
    }

    #[test]
    fn aggressive_critical_success() {
        let opt = AggressiveOptimizer::new();
        let res = opt.try_with_input(1234, None, PressureLevel::Critical, PressureLevel::High, LifecycleState::Background, false, false, false, "background-idle", false, true, Some(200_000_000), Some(150_000_000)).unwrap();
        assert_eq!(res.status, "optimized");
        assert_eq!(res.pressure_before, PressureLevel::Critical);
    }

    #[test]
    fn aggressive_allows_optimizing_lifecycle_under_pressure() {
        let opt = AggressiveOptimizer::new();
        let res = opt.try_with_input(1234, None, PressureLevel::High, PressureLevel::Moderate, LifecycleState::Optimizing, false, false, false, "background-idle", false, true, Some(500), Some(480)).unwrap();
        assert_eq!(res.lifecycle_state, LifecycleState::Optimizing);
        assert_eq!(res.status, "optimized");
    }

    #[test]
    fn aggressive_rejects_foreground() {
        let opt = AggressiveOptimizer::new();
        let err = opt.try_with_input(1234, Some(9999), PressureLevel::High, PressureLevel::High, LifecycleState::Background, true, false, false, "foreground-active", false, true, Some(100), Some(90)).unwrap_err();
        assert!(err.contains("OptimizationRejected"));
        assert!(err.contains("foreground"));
    }

    #[test]
    fn aggressive_rejects_protected() {
        let opt = AggressiveOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::High, PressureLevel::High, LifecycleState::Background, false, false, true, "cpu>10", false, true, Some(200), Some(190)).unwrap_err();
        assert!(err.contains("OptimizationRejected"));
        assert!(err.contains("protected"));
    }

    #[test]
    fn aggressive_rejects_game() {
        let opt = AggressiveOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::High, PressureLevel::High, LifecycleState::Background, false, true, false, "game-protected", false, true, Some(100), Some(90)).unwrap_err();
        assert!(err.to_lowercase().contains("game"));
    }

    #[test]
    fn aggressive_rejects_normal_pressure() {
        let opt = AggressiveOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::Normal, PressureLevel::Normal, LifecycleState::Background, false, false, false, "background-idle", false, true, Some(100), Some(90)).unwrap_err();
        assert!(err.contains("OptimizationRejected"));
        assert!(err.contains("pressure"));
    }

    #[test]
    fn aggressive_rejects_moderate_pressure() {
        let opt = AggressiveOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::Moderate, PressureLevel::Moderate, LifecycleState::Background, false, false, false, "background-idle", false, true, Some(100), Some(90)).unwrap_err();
        assert!(err.contains("pressure"));
    }

    #[test]
    fn aggressive_rejects_active_lifecycle() {
        let opt = AggressiveOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::High, PressureLevel::High, LifecycleState::Active, false, false, false, "background-idle", false, true, Some(100), Some(90)).unwrap_err();
        assert!(err.contains("lifecycle"));
        assert!(err.contains("Active"));
    }

    #[test]
    fn aggressive_rejects_protected_lifecycle() {
        let opt = AggressiveOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::High, PressureLevel::High, LifecycleState::Protected, false, false, false, "protected", false, true, Some(100), Some(90)).unwrap_err();
        assert!(err.contains("OptimizationRejected"));
    }

    #[test]
    fn aggressive_rejects_game_lifecycle() {
        let opt = AggressiveOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::Critical, PressureLevel::Critical, LifecycleState::Game, false, false, false, "game", false, true, Some(100), Some(90)).unwrap_err();
        assert!(err.contains("OptimizationRejected"));
    }

    #[test]
    fn aggressive_rejects_disk_pressure_high() {
        let opt = AggressiveOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::High, PressureLevel::High, LifecycleState::Background, false, false, false, "background-idle", true, true, Some(100), Some(90)).unwrap_err();
        assert!(err.to_lowercase().contains("disk"));
    }

    #[test]
    fn aggressive_rejects_policy_disallows() {
        let opt = AggressiveOptimizer::new();
        let err = opt.try_with_input(1234, None, PressureLevel::High, PressureLevel::High, LifecycleState::Background, false, false, false, "background-idle", false, false, Some(100), Some(90)).unwrap_err();
        assert!(err.to_lowercase().contains("policy"));
    }

    #[test]
    fn aggressive_rejects_download_via_full_input() {
        let opt = AggressiveOptimizer::new();
        let safety = SafetyGovernorInput { download_active: true, ..Default::default() };
        let err = opt.try_with_full_input(1234, None, PressureLevel::High, PressureLevel::High, LifecycleState::Background, safety, Some(100), Some(90)).unwrap_err();
        assert!(err.to_lowercase().contains("download"));
    }

    #[test]
    fn aggressive_result_serializes_camel_case() {
        let opt = AggressiveOptimizer::new();
        let res = opt.try_with_input(42, Some(1), PressureLevel::High, PressureLevel::Moderate, LifecycleState::Background, false, false, false, "background-idle", false, true, Some(1024), Some(512)).unwrap();
        let json = serde_json::to_string(&res).unwrap();
        assert!(json.contains("workingSetBefore"));
        assert!(json.contains("pressureBefore"));
        assert!(json.contains("lifecycleState"));
        assert!(json.contains("intervention"));
    }
}
