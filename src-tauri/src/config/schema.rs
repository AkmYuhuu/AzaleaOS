use crate::error::AzaleaError;
use serde::{Deserialize, Serialize};

pub const CURRENT_VERSION: u32 = 1;

fn default_version() -> u32 {
    CURRENT_VERSION
}
fn default_edition() -> String {
    "full".into()
}
fn default_theme() -> String {
    "system".into()
}
fn default_sidebar_mode() -> String {
    "compact".into()
}
fn default_shortcuts() -> serde_json::Value {
    serde_json::json!({})
}
fn default_resource_mode() -> String {
    "smart".into()
}
fn default_background_opt() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ResourcePolicy {
    #[serde(default = "default_resource_mode")]
    pub mode: String,
    #[serde(
        default = "default_background_opt",
        rename = "backgroundOptimization",
        alias = "background_optimization",
        alias = "backgroundOptimization"
    )]
    pub background_optimization: bool,
}

impl Default for ResourcePolicy {
    fn default() -> Self {
        Self {
            mode: default_resource_mode(),
            background_optimization: default_background_opt(),
        }
    }
}

/// §29 example defaults + migration version.
/// Unknown fields are ignored (serde default allows extra keys).
/// CamelCase JSON keys from spec (sidebarMode, resourcePolicy) are accepted via rename+alias;
/// snake_case also accepted for internal tolerance.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    #[serde(default = "default_version")]
    pub version: u32,

    #[serde(default = "default_edition")]
    pub edition: String,

    #[serde(default = "default_theme")]
    pub theme: String,

    #[serde(
        default = "default_sidebar_mode",
        rename = "sidebarMode",
        alias = "sidebar_mode",
        alias = "sidebarMode"
    )]
    pub sidebar_mode: String,

    #[serde(default = "default_shortcuts")]
    pub shortcuts: serde_json::Value,

    #[serde(
        default,
        rename = "resourcePolicy",
        alias = "resource_policy",
        alias = "resourcePolicy"
    )]
    pub resource_policy: ResourcePolicy,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION,
            edition: default_edition(),
            theme: default_theme(),
            sidebar_mode: default_sidebar_mode(),
            shortcuts: default_shortcuts(),
            resource_policy: ResourcePolicy::default(),
        }
    }
}

impl AppConfig {
    /// Validate enum values and edition contract.
    /// Edition must be "full" else ConfigReadFailed (read path).
    /// config_set maps this to UnsupportedEdition at IPC layer.
    /// No capability fields (maxOsTabs/maxAppsPerOsTab/resourcePolicy) are in config - JSON authority is only
    /// theme/sidebarMode/resourcePolicy.mode; capability limits are NOT configurable via config.json (§41).
    pub fn validate(&self) -> Result<(), AzaleaError> {
        if self.edition != "full" {
            return Err(AzaleaError::ConfigReadFailed(format!(
                "edition must be \"full\", got \"{}\"",
                self.edition
            )));
        }
        if !matches!(self.theme.as_str(), "system" | "dark" | "light") {
            return Err(AzaleaError::ConfigReadFailed(format!(
                "invalid theme \"{}\" (expected system|dark|light)",
                self.theme
            )));
        }
        if !matches!(self.sidebar_mode.as_str(), "compact" | "expanded") {
            return Err(AzaleaError::ConfigReadFailed(format!(
                "invalid sidebarMode \"{}\" (expected compact|expanded)",
                self.sidebar_mode
            )));
        }
        // resourcePolicy.mode - allow spec "smart" plus conservative/aggressive variants
        if !matches!(
            self.resource_policy.mode.as_str(),
            "smart" | "conservative" | "aggressive" | "balanced" | "auto"
        ) {
            return Err(AzaleaError::ConfigReadFailed(format!(
                "invalid resourcePolicy.mode \"{}\"",
                self.resource_policy.mode
            )));
        }
        Ok(())
    }
}
