pub mod manager;
pub mod model;
pub mod persistence;

pub use manager::WorkspaceManager;
pub use model::{AppTab, Workspace, WorkspaceState, MAX_APPS_PER_OS, MAX_OS_TABS};
