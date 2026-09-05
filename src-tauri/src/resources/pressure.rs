use serde::{Deserialize, Serialize};

use crate::resources::{disk, memory};

/// Resource pressure classification - §15 Resource Pressure Engine
/// Observe-only in STEP 11: no behavior change, no optimizer yet.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PressureLevel {
    Normal,
    Moderate,
    High,
    Critical,
}

/// Input snapshot for pressure evaluation - §15 inputs
/// Best-effort heuristic: all signals combined, none is single source of truth.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PressureInput {
    /// Available RAM in bytes (from sysinfo/memory::sample_memory)
    pub available_ram: u64,
    /// Total RAM in bytes - needed to derive available %. `None` → skip available% check, rely on memory_load.
    #[serde(default)]
    pub total_ram: Option<u64>,
    /// System memory load 0..100 (used% approx; via MEMORYSTATUSEX dwMemoryLoad or used/total*100)
    pub memory_load: u8,
    /// Committed memory % 0..100 if available (perf counter). None = unknown → ignore.
    pub committed_pct: Option<f32>,
    pub active_apps: usize,
    pub background_apps: usize,
    /// Disk pressure 0..100 (stub 0.0 in MVP, real via perf counters later)
    pub disk_pressure: f32,
}

impl Default for PressureInput {
    fn default() -> Self {
        Self {
            available_ram: 8 * 1024 * 1024 * 1024,
            total_ram: Some(16 * 1024 * 1024 * 1024),
            memory_load: 30,
            committed_pct: None,
            active_apps: 3,
            background_apps: 2,
            disk_pressure: 0.0,
        }
    }
}

/// Best-effort heuristic per spec §15 + task thresholds.
/// Priority: Critical > High > Moderate > Normal (first match wins).
///
/// Critical if any:
/// - available < 15% (when total_ram known) OR memory_load > 85 OR committed > 90
///   OR background_apps > 8 with elevated memory (load>60) / committed high
/// High if any:
/// - available < 25% OR memory_load > 75 OR committed > 80 OR disk_pressure > 60
/// Moderate if any:
/// - available < 40% OR memory_load > 60 OR committed > 60 OR disk_pressure > 40
///   OR background_apps > 4 (mild background pressure)
/// Else Normal.
///
/// Note: disk_pressure, paging/latency signals are MVP stubs (0.0) - thresholds
/// there only fire when real sampler is wired.
// honey: O(1) pure function, deterministic for given input; expand when paging signals land.
pub fn compute_pressure(input: &PressureInput) -> PressureLevel {
    let available_pct = input.total_ram.and_then(|total| {
        if total == 0 {
            None
        } else {
            Some((input.available_ram as f64 / total as f64) * 100.0)
        }
    });

    let committed = input.committed_pct.unwrap_or(0.0);
    let mem_load = input.memory_load as f32;
    let disk = if input.disk_pressure.is_finite() {
        input.disk_pressure.clamp(0.0, 100.0)
    } else {
        0.0
    };

    // ---- Critical ----
    let critical_mem = mem_load > 85.0 || available_pct.map(|v| v < 15.0).unwrap_or(false) || committed > 90.0;
    let critical_bg = input.background_apps > 8 && (mem_load > 60.0 || committed > 70.0 || available_pct.map(|v| v < 25.0).unwrap_or(false));
    let critical_disk = disk > 85.0 && mem_load > 70.0;
    if critical_mem || critical_bg || critical_disk {
        return PressureLevel::Critical;
    }

    // ---- High ----
    let high_mem = mem_load > 75.0 || available_pct.map(|v| v < 25.0).unwrap_or(false) || committed > 80.0;
    let high_disk = disk > 60.0;
    let high_apps = (input.active_apps + input.background_apps) > 12 && mem_load > 60.0;
    if high_mem || high_disk || high_apps {
        return PressureLevel::High;
    }

    // ---- Moderate ----
    let mod_mem = mem_load > 60.0 || available_pct.map(|v| v < 40.0).unwrap_or(false) || committed > 60.0;
    let mod_disk = disk > 40.0;
    let mod_bg = input.background_apps > 4;
    if mod_mem || mod_disk || mod_bg {
        return PressureLevel::Moderate;
    }

    PressureLevel::Normal
}

/// On-demand evaluator - §14 + §33. No background scheduler in STEP 11.
/// Samples system memory + disk stub, derives memory_load, uses best-effort
/// window counts (fixed 3/2 for MVP; future: query WorkspaceManager).
pub fn evaluate() -> PressureLevel {
    evaluate_from_system()
}

pub fn evaluate_from_system() -> PressureLevel {
    let (total, used, available) = memory::sample_memory();
    let memory_load = if total > 0 {
        ((used as f64 / total as f64) * 100.0).clamp(0.0, 100.0) as u8
    } else {
        0
    };
    let disk_pressure = disk::sample_disk();
    // TODO: wire real committed %, paging signals, active/background counts from workspace/metrics
    let input = PressureInput {
        available_ram: available,
        total_ram: Some(total),
        memory_load,
        committed_pct: None,
        active_apps: 3,
        background_apps: 2,
        disk_pressure,
    };
    let level = compute_pressure(&input);
    log::info!(
        "resource.pressure evaluate total={} available={} load={} disk={} -> {:?}",
        total,
        available,
        memory_load,
        disk_pressure,
        level
    );
    level
}

/// Evaluate with explicit counts (future wiring when WorkspaceManager available without circular dep).
pub fn evaluate_with_counts(active_apps: usize, background_apps: usize) -> PressureLevel {
    let (total, used, available) = memory::sample_memory();
    let memory_load = if total > 0 {
        ((used as f64 / total as f64) * 100.0).clamp(0.0, 100.0) as u8
    } else {
        0
    };
    let input = PressureInput {
        available_ram: available,
        total_ram: Some(total),
        memory_load,
        committed_pct: None,
        active_apps,
        background_apps,
        disk_pressure: disk::sample_disk(),
    };
    compute_pressure(&input)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input_with(available_pct: f64, memory_load: u8, committed: Option<f32>, bg: usize, disk: f32) -> PressureInput {
        let total = 16 * 1024 * 1024 * 1024u64;
        let available = (total as f64 * available_pct / 100.0) as u64;
        PressureInput {
            available_ram: available,
            total_ram: Some(total),
            memory_load,
            committed_pct: committed,
            active_apps: 3,
            background_apps: bg,
            disk_pressure: disk,
        }
    }

    #[test]
    fn normal_when_low_load_and_plenty_ram() {
        let i = input_with(55.0, 30, None, 2, 0.0);
        assert_eq!(compute_pressure(&i), PressureLevel::Normal);
    }

    #[test]
    fn moderate_when_memory_65_or_available_35() {
        let i = input_with(35.0, 65, None, 2, 0.0);
        assert_eq!(compute_pressure(&i), PressureLevel::Moderate);
        let i2 = input_with(50.0, 62, None, 2, 0.0);
        assert_eq!(compute_pressure(&i2), PressureLevel::Moderate);
    }

    #[test]
    fn high_when_available_20_or_load_80() {
        let i = input_with(20.0, 50, None, 2, 0.0);
        assert_eq!(compute_pressure(&i), PressureLevel::High);
        let i2 = input_with(50.0, 78, None, 2, 0.0);
        assert_eq!(compute_pressure(&i2), PressureLevel::High);
        let i3 = input_with(50.0, 50, Some(85.0), 2, 0.0);
        assert_eq!(compute_pressure(&i3), PressureLevel::High);
    }

    #[test]
    fn critical_when_available_10_or_load_90_or_committed_95() {
        let i = input_with(10.0, 50, None, 2, 0.0);
        assert_eq!(compute_pressure(&i), PressureLevel::Critical);
        let i2 = input_with(50.0, 90, None, 2, 0.0);
        assert_eq!(compute_pressure(&i2), PressureLevel::Critical);
        let i3 = input_with(50.0, 50, Some(95.0), 2, 0.0);
        assert_eq!(compute_pressure(&i3), PressureLevel::Critical);
    }

    #[test]
    fn critical_via_background_pressure() {
        // background >8 + high mem triggers critical
        let i = input_with(50.0, 65, None, 9, 0.0);
        assert_eq!(compute_pressure(&i), PressureLevel::Critical);
        // same bg count but low mem → not critical (falls to moderate)
        let i2 = input_with(50.0, 40, None, 9, 0.0);
        assert_eq!(compute_pressure(&i2), PressureLevel::Moderate);
    }

    #[test]
    fn deterministic_and_serializes_camel_case() {
        let i = input_with(55.0, 30, None, 2, 0.0);
        let a = compute_pressure(&i);
        let b = compute_pressure(&i);
        assert_eq!(a, b);
        // camelCase: Normal -> "normal"
        let json = serde_json::to_string(&PressureLevel::Critical).unwrap();
        assert_eq!(json, "\"critical\"");
        let json2 = serde_json::to_string(&PressureLevel::Normal).unwrap();
        assert_eq!(json2, "\"normal\"");
    }

    #[test]
    fn available_pct_none_fallback_uses_memory_load_only() {
        let input = PressureInput {
            available_ram: 0,
            total_ram: None,
            memory_load: 90,
            committed_pct: None,
            active_apps: 1,
            background_apps: 1,
            disk_pressure: 0.0,
        };
        assert_eq!(compute_pressure(&input), PressureLevel::Critical);
        let input2 = PressureInput {
            available_ram: 0,
            total_ram: None,
            memory_load: 30,
            committed_pct: None,
            active_apps: 1,
            background_apps: 1,
            disk_pressure: 0.0,
        };
        assert_eq!(compute_pressure(&input2), PressureLevel::Normal);
    }

    #[test]
    fn evaluate_is_one_of_four() {
        let lvl = evaluate();
        assert!(matches!(lvl, PressureLevel::Normal | PressureLevel::Moderate | PressureLevel::High | PressureLevel::Critical));
    }
}
