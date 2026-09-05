use std::path::PathBuf;
use std::sync::Mutex;

use crate::error::AzaleaError;

use super::model::{AppTab, Workspace, WorkspaceState, MAX_APPS_PER_OS, MAX_OS_TABS};
use super::persistence;

/// In-memory WorkspaceManager with Mutex<WorkspaceState>.
/// Persistence is atomic via `persistence::save_workspaces` after each mutation.
/// Limits enforced with typed AzaleaError variants (§41).
pub struct WorkspaceManager {
    state: Mutex<WorkspaceState>,
    config_dir: PathBuf,
}

impl WorkspaceManager {
    /// Create manager loading from disk (or seeded default if missing).
    pub fn new(config_dir: PathBuf) -> Self {
        let state = persistence::load_workspaces(&config_dir);
        Self {
            state: Mutex::new(state),
            config_dir,
        }
    }

    /// For tests: create with explicit initial state (no disk load).
    #[cfg(test)]
    pub fn new_with_state(config_dir: PathBuf, initial: WorkspaceState) -> Self {
        Self {
            state: Mutex::new(initial),
            config_dir,
        }
    }

    /// Snapshot clone for tests/persistence verification.
    pub fn snapshot(&self) -> WorkspaceState {
        self.state.lock().expect("workspace mutex poisoned").clone()
    }

    pub fn get_workspaces(&self) -> Vec<Workspace> {
        self.state.lock().expect("workspace mutex poisoned").workspaces.clone()
    }

    pub fn get_workspace(&self, id: &str) -> Option<Workspace> {
        self.state
            .lock()
            .expect("workspace mutex poisoned")
            .workspaces
            .iter()
            .find(|w| w.id == id)
            .cloned()
    }

    pub fn get_active_id(&self) -> Option<String> {
        self.state
            .lock()
            .expect("workspace mutex poisoned")
            .active_workspace_id
            .clone()
    }

    pub fn get_apps_for_workspace(&self, workspace_id: &str) -> Vec<AppTab> {
        let s = self.state.lock().expect("workspace mutex poisoned");
        s.app_tabs
            .iter()
            .filter(|a| a.workspace_id == workspace_id)
            .cloned()
            .collect()
    }

    pub fn list_all_app_tabs(&self) -> Vec<AppTab> {
        self.state.lock().expect("workspace mutex poisoned").app_tabs.clone()
    }

    // ---- mutations (all enforce limits + persist) ----

    pub fn create_workspace(&self, name: String) -> Result<Workspace, AzaleaError> {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            return Err(AzaleaError::WorkspaceNameEmpty("workspace name must not be empty".into()));
        }
        // STEP 20 hardening: reject null byte and control chars; cap length (Windows FS/product policy)
        if trimmed.contains('\0') {
            return Err(AzaleaError::WorkspaceNameEmpty("workspace name contains null byte".into()));
        }
        if trimmed.chars().any(|c| c.is_control()) {
            return Err(AzaleaError::WorkspaceNameEmpty("workspace name contains control char".into()));
        }
        if trimmed.len() > 100 {
            return Err(AzaleaError::WorkspaceNameEmpty("workspace name too long (max 100)".into()));
        }
        let mut guard = self.state.lock().expect("workspace mutex poisoned");
        if guard.workspaces.len() >= MAX_OS_TABS {
            return Err(AzaleaError::WorkspaceLimitExceeded(format!(
                "max OS Tabs ({}) reached",
                MAX_OS_TABS
            )));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let order = guard.workspaces.len() as u8;
        let ws = Workspace {
            id: id.clone(),
            name: trimmed,
            order,
            app_tab_ids: Vec::new(),
        };
        guard.workspaces.push(ws.clone());
        guard.active_workspace_id = Some(id);
        // normalize already correct
        let to_save = guard.clone();
        drop(guard);
        persistence::save_workspaces(&self.config_dir, &to_save)?;
        log::info!("workspace.create id={} order={} name={}", ws.id, ws.order, ws.name);
        Ok(ws)
    }

    pub fn rename_workspace(&self, id: &str, name: String) -> Result<Workspace, AzaleaError> {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            return Err(AzaleaError::WorkspaceNameEmpty("workspace name must not be empty".into()));
        }
        // STEP 20 hardening: same checks as create (§36 narrow validation)
        if trimmed.contains('\0') {
            return Err(AzaleaError::WorkspaceNameEmpty("workspace name contains null byte".into()));
        }
        if trimmed.chars().any(|c| c.is_control()) {
            return Err(AzaleaError::WorkspaceNameEmpty("workspace name contains control char".into()));
        }
        if trimmed.len() > 100 {
            return Err(AzaleaError::WorkspaceNameEmpty("workspace name too long (max 100)".into()));
        }
        let mut guard = self.state.lock().expect("workspace mutex poisoned");
        let ws = guard
            .workspaces
            .iter_mut()
            .find(|w| w.id == id)
            .ok_or_else(|| AzaleaError::WorkspaceNotFound(format!("workspace not found: {}", id)))?;
        ws.name = trimmed.clone();
        let out = ws.clone();
        let to_save = guard.clone();
        drop(guard);
        persistence::save_workspaces(&self.config_dir, &to_save)?;
        log::info!("workspace.rename id={} name={}", id, out.name);
        Ok(out)
    }

    pub fn close_workspace(&self, id: &str) -> Result<(), AzaleaError> {
        let mut guard = self.state.lock().expect("workspace mutex poisoned");
        let idx = guard
            .workspaces
            .iter()
            .position(|w| w.id == id)
            .ok_or_else(|| AzaleaError::WorkspaceNotFound(format!("workspace not found: {}", id)))?;

        let was_active = guard.active_workspace_id.as_deref() == Some(id);

        // Remove workspace
        guard.workspaces.remove(idx);
        // Remove associated app tabs
        guard.app_tabs.retain(|a| a.workspace_id != id);

        // Re-normalize order
        guard.normalize_order();

        if was_active {
            if guard.workspaces.is_empty() {
                guard.active_workspace_id = None;
                // honey: leave empty - frontend ensures auto-create if needed. No fallback to avoid surprising persistence.
            } else {
                // nearest: prefer idx-1 else idx (which now points to next) else last
                let remaining = guard.workspaces.len();
                let next_idx = if idx < remaining { idx } else { remaining - 1 };
                let prev_idx_in_bounds = idx > 0;
                let chosen_idx = if prev_idx_in_bounds { idx - 1 } else { next_idx };
                let chosen_id = guard.workspaces[chosen_idx].id.clone();
                guard.active_workspace_id = Some(chosen_id);
            }
        }

        let to_save = guard.clone();
        drop(guard);
        persistence::save_workspaces(&self.config_dir, &to_save)?;
        log::info!("workspace.close id={} was_active={}", id, was_active);
        Ok(())
    }

    pub fn switch_workspace(&self, id: &str) -> Result<(), AzaleaError> {
        let mut guard = self.state.lock().expect("workspace mutex poisoned");
        if !guard.workspaces.iter().any(|w| w.id == id) {
            return Err(AzaleaError::WorkspaceNotFound(format!("workspace not found: {}", id)));
        }
        guard.active_workspace_id = Some(id.to_string());
        let to_save = guard.clone();
        drop(guard);
        persistence::save_workspaces(&self.config_dir, &to_save)?;
        log::info!("workspace.switch id={}", id);
        Ok(())
    }

    pub fn add_app_to_workspace(
        &self,
        workspace_id: &str,
        app_id: String,
    ) -> Result<AppTab, AzaleaError> {
        if app_id.trim().is_empty() {
            return Err(AzaleaError::InvalidPath("app_id must not be empty".into()));
        }
        let mut guard = self.state.lock().expect("workspace mutex poisoned");
        // Check global count first (immutable borrow before mutable)
        let count_for_ws = guard.app_tabs.iter().filter(|a| a.workspace_id == workspace_id).count();
        if count_for_ws >= MAX_APPS_PER_OS {
            return Err(AzaleaError::AppLimitExceeded(format!(
                "max apps per OS Tab ({}) reached for workspace {}",
                MAX_APPS_PER_OS, workspace_id
            )));
        }
        let ws_idx = guard
            .workspaces
            .iter()
            .position(|w| w.id == workspace_id)
            .ok_or_else(|| AzaleaError::WorkspaceNotFound(format!("workspace not found: {}", workspace_id)))?;
        if guard.workspaces[ws_idx].app_tab_ids.len() >= MAX_APPS_PER_OS {
            return Err(AzaleaError::AppLimitExceeded(format!(
                "max apps per OS Tab ({}) reached for workspace {}",
                MAX_APPS_PER_OS, workspace_id
            )));
        }
        let ws = &mut guard.workspaces[ws_idx];

        let tab_id = uuid::Uuid::new_v4().to_string();
        let now_ms = chrono::Utc::now().timestamp_millis() as u64;
        let tab = AppTab {
            id: tab_id.clone(),
            workspace_id: workspace_id.to_string(),
            app_id: app_id.trim().to_string(),
            runtime_id: None,
            lifecycle_state: "active".to_string(),
            protection_state: "none".to_string(),
            resource_state: None,
            last_focus_timestamp: now_ms,
        };
        ws.app_tab_ids.push(tab_id);
        guard.app_tabs.push(tab.clone());

        // update focus timestamp already set
        let to_save = guard.clone();
        drop(guard);
        persistence::save_workspaces(&self.config_dir, &to_save)?;
        log::info!(
            "workspace.add_app workspace_id={} app_tab_id={} app_id={}",
            workspace_id,
            tab.id,
            tab.app_id
        );
        Ok(tab)
    }

    pub fn remove_app_from_workspace(
        &self,
        workspace_id: &str,
        app_tab_id: &str,
    ) -> Result<(), AzaleaError> {
        let mut guard = self.state.lock().expect("workspace mutex poisoned");
        let ws = guard
            .workspaces
            .iter_mut()
            .find(|w| w.id == workspace_id)
            .ok_or_else(|| AzaleaError::WorkspaceNotFound(format!("workspace not found: {}", workspace_id)))?;

        let pos = ws
            .app_tab_ids
            .iter()
            .position(|id| id == app_tab_id)
            .ok_or_else(|| AzaleaError::AppTabNotFound(format!("appTab not found in workspace: {}", app_tab_id)))?;

        ws.app_tab_ids.remove(pos);
        let before = guard.app_tabs.len();
        guard.app_tabs.retain(|a| !(a.id == app_tab_id && a.workspace_id == workspace_id));
        if guard.app_tabs.len() == before {
            // existed in workspace but not in global list - still treat as removed (inconsistent state)
            log::warn!(
                "workspace.remove_app inconsistent state workspace_id={} app_tab_id={}",
                workspace_id,
                app_tab_id
            );
        }

        let to_save = guard.clone();
        drop(guard);
        persistence::save_workspaces(&self.config_dir, &to_save)?;
        log::info!(
            "workspace.remove_app workspace_id={} app_tab_id={}",
            workspace_id,
            app_tab_id
        );
        Ok(())
    }

    /// Reload from disk (used on startup/tests).
    pub fn reload(&self) -> WorkspaceState {
        let loaded = persistence::load_workspaces(&self.config_dir);
        let mut guard = self.state.lock().expect("workspace mutex poisoned");
        *guard = loaded.clone();
        loaded
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp_base() -> (PathBuf, PathBuf) {
        // unique temp dir without tempfile crate
        let base = std::env::temp_dir()
            .join("azalea-workspace-test")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&base).unwrap();
        let holder = base.clone();
        (base, holder)
    }

    fn tmp_manager() -> (WorkspaceManager, PathBuf) {
        let (base, holder) = tmp_base();
        let m = WorkspaceManager::new(base.clone());
        (m, holder)
    }

    #[test]
    fn create_up_to_10_succeeds_11th_fails() {
        let (m, _holder) = tmp_manager();
        // seeded has 3, so we can create 7 more to reach 10
        for i in 0..7 {
            let ws = m.create_workspace(format!("WS {}", i)).unwrap();
            assert!(!ws.id.is_empty());
        }
        assert_eq!(m.get_workspaces().len(), 10);
        let err = m.create_workspace("eleventh".into()).unwrap_err();
        match err {
            AzaleaError::WorkspaceLimitExceeded(_) => {},
            other => panic!("expected WorkspaceLimitExceeded, got {}", other),
        }
    }

    #[test]
    fn add_app_up_to_10_per_workspace_11th_fails() {
        let (m, _holder) = tmp_manager();
        let ws_id = m.get_workspaces()[0].id.clone();
        for i in 0..10 {
            m.add_app_to_workspace(&ws_id, format!("app-{}", i)).unwrap();
        }
        let err = m.add_app_to_workspace(&ws_id, "app-11".into()).unwrap_err();
        match err {
            AzaleaError::AppLimitExceeded(_) => {},
            other => panic!("expected AppLimitExceeded, got {}", other),
        }
    }

    #[test]
    fn persistence_roundtrip() {
        let (base, _holder) = tmp_base();
        let m = WorkspaceManager::new(base.clone());
        let ws = m.create_workspace("PersistTest".into()).unwrap();
        m.add_app_to_workspace(&ws.id, "app-xyz".into()).unwrap();
        let snap = m.snapshot();
        // New manager loads from same dir
        let m2 = WorkspaceManager::new(base.clone());
        let snap2 = m2.snapshot();
        assert_eq!(snap.workspaces.len(), snap2.workspaces.len());
        assert_eq!(snap.app_tabs.len(), snap2.app_tabs.len());
        let file = persistence::workspaces_file(&base);
        assert!(file.exists());
    }

    #[test]
    fn close_active_switches_to_nearest() {
        let (base, _holder) = tmp_base();
        let empty = WorkspaceState {
            workspaces: vec![],
            active_workspace_id: None,
            app_tabs: vec![],
        };
        let m = WorkspaceManager::new_with_state(base, empty);
        let a = m.create_workspace("A".into()).unwrap();
        let b = m.create_workspace("B".into()).unwrap();
        let c = m.create_workspace("C".into()).unwrap();
        assert_eq!(m.get_active_id(), Some(c.id.clone()));
        m.close_workspace(&c.id).unwrap();
        assert_eq!(m.get_active_id(), Some(b.id.clone()));
        m.close_workspace(&b.id).unwrap();
        assert_eq!(m.get_active_id(), Some(a.id.clone()));
    }
}
