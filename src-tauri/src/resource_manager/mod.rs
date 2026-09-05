pub mod activity;
pub mod lifecycle;
pub mod optimizer;
pub mod protection;

pub use activity::{detect_activity, detect_activity_with_metrics, is_game_category, is_unknown_category, ActivityInfo, ActivityState};
pub use lifecycle::{compute_lifecycle, evaluate_lifecycle, LifecycleInput, LifecycleState};
pub use optimizer::{AggressiveOptimizer, GentleOptimizer, OptimizerResult, SafetyGovernor, SafetyGovernorInput};
