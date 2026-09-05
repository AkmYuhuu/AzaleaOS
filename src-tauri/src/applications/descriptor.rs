use serde::{Deserialize, Serialize};

/// Source of discovered application - §5.2
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppSource {
    Windows,
    Azalea,
    Unknown,
}

impl Default for AppSource {
    fn default() -> Self {
        Self::Unknown
    }
}

/// Category placeholder - heuristic only for STEP 3.
/// Later classifier (§6) will refine `supported`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppCategory {
    Browser,
    Developer,
    Productivity,
    Utility,
    Game,
    System,
    Unknown,
}

impl Default for AppCategory {
    fn default() -> Self {
        Self::Unknown
    }
}

/// Windows app descriptor - §5.2, camelCase DTO for Tauri IPC.
/// Frontend receives camelCase keys: `executablePath`, `iconRef`, `unsupportedReason`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDescriptor {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon_ref: Option<String>,
    pub source: AppSource,
    pub category: AppCategory,
    pub supported: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unsupported_reason: Option<String>,
}
