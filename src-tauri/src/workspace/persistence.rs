use std::path::{Path, PathBuf};

use crate::error::AzaleaError;
use super::model::WorkspaceState;

/// Directory: {config_dir}/workspaces
pub fn workspaces_dir(config_dir: &Path) -> PathBuf {
    config_dir.join("workspaces")
}

/// File: {config_dir}/workspaces/workspaces.json
pub fn workspaces_file(config_dir: &Path) -> PathBuf {
    workspaces_dir(config_dir).join("workspaces.json")
}

/// Load workspace state.
/// - If file missing -> seeded default (Development/Research/Design) without writing (lazy).
/// - If parse fails -> log WARN and return seeded default (avoid bricking on corruption).
/// - If file exists and parses -> return it (normalize order).
pub fn load_workspaces(config_dir: &Path) -> WorkspaceState {
    let path = workspaces_file(config_dir);
    if !path.exists() {
        log::info!("workspace.load missing -> seeded default path={}", path.display());
        return WorkspaceState::seeded_default();
    }
    match std::fs::read(&path) {
        Ok(bytes) => {
            if bytes.is_empty() {
                log::warn!("workspace.load empty file -> seeded default path={}", path.display());
                return WorkspaceState::seeded_default();
            }
            match serde_json::from_slice::<WorkspaceState>(&bytes) {
                Ok(mut state) => {
                    state.normalize_order();
                    log::info!(
                        "workspace.load ok path={} workspaces={} active={:?}",
                        path.display(),
                        state.workspaces.len(),
                        state.active_workspace_id
                    );
                    state
                }
                Err(e) => {
                    log::warn!(
                        "workspace.load parse failed -> seeded default path={} err={}",
                        path.display(),
                        e
                    );
                    WorkspaceState::seeded_default()
                }
            }
        }
        Err(e) => {
            log::warn!(
                "workspace.load read failed -> seeded default path={} err={}",
                path.display(),
                e
            );
            WorkspaceState::seeded_default()
        }
    }
}

/// Save workspace state atomically: ensure dir, write to workspaces.json.tmp, rename.
/// Mirrors config::repository::write_config pattern (tmp+rename).
pub fn save_workspaces(config_dir: &Path, state: &WorkspaceState) -> Result<(), AzaleaError> {
    let dir = workspaces_dir(config_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|e| AzaleaError::ConfigWriteFailed(format!("create workspaces dir {}: {}", dir.display(), e)))?;

    let path = workspaces_file(config_dir);
    let tmp = dir.join("workspaces.json.tmp");

    let json = serde_json::to_string_pretty(state)
        .map_err(|e| AzaleaError::ConfigWriteFailed(format!("serialize workspaces: {}", e)))?;

    std::fs::write(&tmp, json.as_bytes())
        .map_err(|e| AzaleaError::ConfigWriteFailed(format!("write tmp {}: {}", tmp.display(), e)))?;

    std::fs::rename(&tmp, &path)
        .map_err(|e| AzaleaError::ConfigWriteFailed(format!("rename {} -> {}: {}", tmp.display(), path.display(), e)))?;

    log::info!(
        "workspace.save ok path={} workspaces={} appTabs={}",
        path.display(),
        state.workspaces.len(),
        state.app_tabs.len()
    );
    Ok(())
}
