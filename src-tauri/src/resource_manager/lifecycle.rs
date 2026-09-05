use serde::{Deserialize, Serialize};

use crate::resources::pressure::PressureLevel;

/// Lifecycle states - §17 + §48 STEP 13.
/// Observe-only in STEP 13: no optimizer side-effects.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LifecycleState {
    Active,
    Background,
    Protected,
    Game,
    Optimizing,
    Unsupported,
    Error,
}

impl std::fmt::Display for LifecycleState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Active => "active",
            Self::Background => "background",
            Self::Protected => "protected",
            Self::Game => "game",
            Self::Optimizing => "optimizing",
            Self::Unsupported => "unsupported",
            Self::Error => "error",
        };
        write!(f, "{}", s)
    }
}

/// Pure input for lifecycle decision - §17 flow inputs.
/// Uses PressureLevel from pressure engine (§15) + activity signals (§16).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleInput {
    pub is_foreground: bool,
    pub is_protected: bool,
    pub is_game: bool,
    pub is_unknown: bool,
    pub pressure: PressureLevel,
    pub cpu_active: bool,
}

/// Pure state machine - §17 flow (observe-only, no mutation).
///
/// Priority (first match wins):
/// 1. Game (category == GAME) → Game (§23, always protected)
/// 2. Foreground → Active (§17 ACTIVE)
/// 3. Background + protected (important work) → Protected
/// 4. Resource pressure HIGH/CRITICAL (background, not protected, not game) → Optimizing
/// 5. Otherwise → Background
///
/// Unsupported / Error are not produced by this pure function;
/// they are returned by `evaluate_lifecycle` wrapper which checks
/// registry `supported` and process liveness (§36, §37). This keeps
/// the pure function deterministic and testable for the 5 core states.
/// A helper `compute_lifecycle_extended` covers Unsupported/Error when
/// explicit flags are supplied (for tests / future wiring).
// honey: O(1) pure, deterministic; no I/O.
pub fn compute_lifecycle(input: &LifecycleInput) -> LifecycleState {
    if input.is_game {
        return LifecycleState::Game;
    }
    if input.is_foreground {
        return LifecycleState::Active;
    }
    if input.is_protected {
        return LifecycleState::Protected;
    }
    if matches!(input.pressure, PressureLevel::High | PressureLevel::Critical) {
        return LifecycleState::Optimizing;
    }
    LifecycleState::Background
}

/// Extended pure helper that also honours explicit unsupported/error flags.
/// Used for tests and for IPC wrapper when those signals are known out-of-band.
pub fn compute_lifecycle_extended(
    input: &LifecycleInput,
    is_unsupported: bool,
    has_error: bool,
) -> LifecycleState {
    if has_error {
        return LifecycleState::Error;
    }
    if is_unsupported {
        return LifecycleState::Unsupported;
    }
    compute_lifecycle(input)
}

/// Live evaluator - wires activity detection (§16) + pressure (§15).
/// Observe-only: no process mutation, no optimizer trigger.
/// Ordering: Error (dead pid) > Unsupported (descriptor supported==false) > pure state machine.
pub fn evaluate_lifecycle(pid: u32, hwnd: u64, app_id: &str) -> LifecycleState {
    // §37 crash/error: pid supplied but process no longer alive → Error
    if pid != 0 && !crate::processes::lifecycle::is_alive(pid) {
        log::warn!("lifecycle.evaluate pid={} not alive -> Error", pid);
        return LifecycleState::Error;
    }

    // §11.1 Unsupported: descriptor explicitly unsupported (future classifier or host integration)
    if !app_id.is_empty() {
        if let Some(desc) = crate::applications::registry::get_by_id(app_id) {
            if !desc.supported {
                log::info!(
                    "lifecycle.evaluate app_id={} unsupported reason={:?} -> Unsupported",
                    app_id,
                    desc.unsupported_reason
                );
                return LifecycleState::Unsupported;
            }
        }
    }

    let info = crate::resource_manager::activity::detect_activity(pid, hwnd, app_id);
    let pressure = crate::resources::pressure::evaluate();
    let is_foreground = info.state == crate::resource_manager::activity::ActivityState::Foreground;

    let input = LifecycleInput {
        is_foreground,
        is_protected: info.protected,
        is_game: info.is_game,
        is_unknown: info.is_unknown,
        pressure,
        cpu_active: info.cpu_activity,
    };

    let state = compute_lifecycle(&input);
    log::info!(
        "lifecycle.evaluate pid={} hwnd={} app_id={} fg={} protected={} game={} unknown={} pressure={:?} cpu_active={} -> {}",
        pid,
        hwnd,
        app_id,
        is_foreground,
        info.protected,
        info.is_game,
        info.is_unknown,
        pressure,
        info.cpu_activity,
        state
    );
    state
}

/// Deterministic evaluator with injected activity/pressure - test seam.
/// Useful for IPC tests that don't want live sysinfo/Win32 sampling.
pub fn evaluate_with_input(
    is_foreground: bool,
    is_protected: bool,
    is_game: bool,
    is_unknown: bool,
    pressure: PressureLevel,
    cpu_active: bool,
) -> LifecycleState {
    let input = LifecycleInput {
        is_foreground,
        is_protected,
        is_game,
        is_unknown,
        pressure,
        cpu_active,
    };
    compute_lifecycle(&input)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resources::pressure::PressureLevel;

    fn input(
        fg: bool,
        protected: bool,
        game: bool,
        unknown: bool,
        pressure: PressureLevel,
        cpu: bool,
    ) -> LifecycleInput {
        LifecycleInput {
            is_foreground: fg,
            is_protected: protected,
            is_game: game,
            is_unknown: unknown,
            pressure,
            cpu_active: cpu,
        }
    }

    #[test]
    fn foreground_active() {
        let i = input(true, false, false, false, PressureLevel::Normal, false);
        assert_eq!(compute_lifecycle(&i), LifecycleState::Active);
    }

    #[test]
    fn foreground_game_overrides_active() {
        // §23 game always Game even if foreground - observe-only protection
        let i = input(true, false, true, false, PressureLevel::Normal, false);
        assert_eq!(compute_lifecycle(&i), LifecycleState::Game);
    }

    #[test]
    fn background_protected() {
        let i = input(false, true, false, false, PressureLevel::Normal, true);
        assert_eq!(compute_lifecycle(&i), LifecycleState::Protected);
    }

    #[test]
    fn background_high_pressure_optimizing() {
        let i = input(false, false, false, false, PressureLevel::High, false);
        assert_eq!(compute_lifecycle(&i), LifecycleState::Optimizing);
    }

    #[test]
    fn background_critical_optimizing() {
        let i = input(false, false, false, false, PressureLevel::Critical, false);
        assert_eq!(compute_lifecycle(&i), LifecycleState::Optimizing);
    }

    #[test]
    fn background_normal_is_background() {
        let i = input(false, false, false, false, PressureLevel::Normal, false);
        assert_eq!(compute_lifecycle(&i), LifecycleState::Background);
    }

    #[test]
    fn background_moderate_stays_background() {
        // Only High/Critical trigger Optimizing per §17
        let i = input(false, false, false, false, PressureLevel::Moderate, false);
        assert_eq!(compute_lifecycle(&i), LifecycleState::Background);
    }

    #[test]
    fn game_overrides_protected_and_pressure() {
        let i = input(false, true, true, false, PressureLevel::Critical, true);
        assert_eq!(compute_lifecycle(&i), LifecycleState::Game);
    }

    #[test]
    fn protected_overrides_optimizing_pressure() {
        // Background protected should stay Protected even under high pressure
        let i = input(false, true, false, false, PressureLevel::Critical, true);
        assert_eq!(compute_lifecycle(&i), LifecycleState::Protected);
    }

    #[test]
    fn serialize_camel_case() {
        assert_eq!(serde_json::to_string(&LifecycleState::Active).unwrap(), "\"active\"");
        assert_eq!(serde_json::to_string(&LifecycleState::Background).unwrap(), "\"background\"");
        assert_eq!(serde_json::to_string(&LifecycleState::Protected).unwrap(), "\"protected\"");
        assert_eq!(serde_json::to_string(&LifecycleState::Game).unwrap(), "\"game\"");
        assert_eq!(serde_json::to_string(&LifecycleState::Optimizing).unwrap(), "\"optimizing\"");
        assert_eq!(serde_json::to_string(&LifecycleState::Unsupported).unwrap(), "\"unsupported\"");
        assert_eq!(serde_json::to_string(&LifecycleState::Error).unwrap(), "\"error\"");
    }

    #[test]
    fn display_matches_camel_case() {
        assert_eq!(LifecycleState::Active.to_string(), "active");
        assert_eq!(LifecycleState::Error.to_string(), "error");
        assert_eq!(LifecycleState::Game.to_string(), "game");
    }

    #[test]
    fn extended_handles_unsupported_and_error() {
        let base = input(false, false, false, false, PressureLevel::Normal, false);
        assert_eq!(
            compute_lifecycle_extended(&base, true, false),
            LifecycleState::Unsupported
        );
        assert_eq!(
            compute_lifecycle_extended(&base, false, true),
            LifecycleState::Error
        );
        // error wins over unsupported
        assert_eq!(
            compute_lifecycle_extended(&base, true, true),
            LifecycleState::Error
        );
    }

    #[test]
    fn evaluate_with_input_seam() {
        assert_eq!(
            evaluate_with_input(true, false, false, false, PressureLevel::Normal, false),
            LifecycleState::Active
        );
        assert_eq!(
            evaluate_with_input(false, false, false, false, PressureLevel::High, false),
            LifecycleState::Optimizing
        );
    }
}
