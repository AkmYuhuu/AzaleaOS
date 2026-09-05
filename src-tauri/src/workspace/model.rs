use serde::{Deserialize, Serialize};

/// Full capability limits - enforced in Rust core (§41).
pub const MAX_OS_TABS: usize = 10;
pub const MAX_APPS_PER_OS: usize = 10;

/// Workspace == OS Tab (§12). Minimal metadata + runtime association.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub order: u8,
    /// Associated AppTab ids (references into WorkspaceState.app_tabs).
    #[serde(default)]
    pub app_tab_ids: Vec<String>,
}

/// AppTab (§13). One app instance bound to a workspace.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppTab {
    pub id: String,
    pub workspace_id: String,
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_id: Option<String>,
    /// Lifecycle state string - ACTIVE/BACKGROUND/PROTECTED/OPTIMIZING/GAME/ERROR etc (§17).
    #[serde(default = "default_lifecycle_state")]
    pub lifecycle_state: String,
    #[serde(default = "default_protection_state")]
    pub protection_state: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource_state: Option<String>,
    #[serde(default)]
    pub last_focus_timestamp: u64,
}

fn default_lifecycle_state() -> String {
    "active".to_string()
}
fn default_protection_state() -> String {
    "none".to_string()
}

/// Persisted workspace state file: %LOCALAPPDATA%\AzaleaOS\Full\workspaces\workspaces.json (§29).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub workspaces: Vec<Workspace>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_workspace_id: Option<String>,
    /// All AppTabs across workspaces - flattened for persistence atomicity.
    #[serde(default)]
    pub app_tabs: Vec<AppTab>,
}

impl Default for WorkspaceState {
    fn default() -> Self {
        Self::seeded_default()
    }
}

impl WorkspaceState {
    /// Seeded default for first-run MVP: 3 tabs Development/Research/Design.
    /// frontend workspaceStore uses same names; ids are UUIDs (backend authority).
    pub fn seeded_default() -> Self {
        let w1 = Workspace {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Development".to_string(),
            order: 0,
            app_tab_ids: Vec::new(),
        };
        let w2 = Workspace {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Research".to_string(),
            order: 1,
            app_tab_ids: Vec::new(),
        };
        let w3 = Workspace {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Design".to_string(),
            order: 2,
            app_tab_ids: Vec::new(),
        };
        let active = Some(w1.id.clone());
        Self {
            workspaces: vec![w1, w2, w3],
            active_workspace_id: active,
            app_tabs: Vec::new(),
        }
    }

    /// Validate order invariants - order == index.
    pub fn normalize_order(&mut self) {
        for (i, w) in self.workspaces.iter_mut().enumerate() {
            w.order = i as u8;
        }
    }
}
