use super::edition::Edition;
use serde::{Deserialize, Serialize};

// STEP 21 - Full Capability Enforcement Audit (§48 STEP 21, §41, §2A, §3, §12):
// AzaleaOS Full capability contract - build-time authority only.
// - OS Tabs max 10 (MAX_OS_TABS), Apps/Tab 10 (MAX_APPS_PER_OS), Resource Full/adaptive, Automation ON, Customization FULL.
// - No runtime lite switch: no env var, no --lite arg, no std::env::args inspection, no dynamic edition parsing (FORBIDDEN).
// - Frontend/file JSON cannot override limits; authority is Capabilities::FULL / FULL_CAPABILITIES constant.
// - IPC get_capabilities() returns only Full DTO via FULL_CAPABILITIES (hardcoded, not dynamic).
// - Config has no capability fields; unknown JSON keys ignored and rejected via validate() (edition must be "full").
// - WorkspaceManager enforces 10/10 with typed AzaleaError::WorkspaceLimitExceeded / AppLimitExceeded.
// - Editions: only Edition::Full exists; from_edition() exhaustive match prevents Lite path.
// - grep lite toggle: 0 in Rust core (only docs/caniuse-lite external dep, not code).
/// Capability contract for AzaleaOS Full - build-time authority.
/// Frontend and file JSON must not override these limits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Capabilities {
    pub max_os_tabs: u8,
    pub max_apps_per_os_tab: u8,
    pub advanced_resource_mgmt: bool,
    pub advanced_automation: bool,
    pub advanced_customization: bool,
}

impl Capabilities {
    /// Compile-time constant for Full.
    pub const FULL: Self = Self {
        max_os_tabs: 10,
        max_apps_per_os_tab: 10,
        advanced_resource_mgmt: true,
        advanced_automation: true,
        advanced_customization: true,
    };

    /// Full capability set - single authority.
    pub fn full() -> Self {
        Self::FULL
    }

    /// Derive from edition (currently only Full exists - no switch).
    pub fn from_edition(edition: Edition) -> Self {
        match edition {
            Edition::Full => Self::full(),
        }
    }
}

/// Compile-time exported constant for static checks and tests.
pub const FULL_CAPABILITIES: Capabilities = Capabilities::FULL;

/// IPC DTO - only Full surface (§41). No Lite variant exists.
/// Serialized as camelCase for Tauri IPC; resource_policy is always "Full/adaptive" for Full.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilitiesDTO {
    pub max_os_tabs: u8,
    pub max_apps_per_os_tab: u8,
    pub resource_policy: String,
    pub advanced_automation: bool,
    pub advanced_customization: bool,
    pub edition: String,
}

impl CapabilitiesDTO {
    /// Build Full-only DTO from FULL_CAPABILITIES (hardcoded - no env/dynamic).
    pub fn full_dto() -> Self {
        // FORBIDDEN: no env var, no --lite flag, no args inspection - hardcoded Full.
        let caps = FULL_CAPABILITIES;
        Self {
            max_os_tabs: caps.max_os_tabs,
            max_apps_per_os_tab: caps.max_apps_per_os_tab,
            resource_policy: "Full/adaptive".to_string(),
            advanced_automation: caps.advanced_automation,
            advanced_customization: caps.advanced_customization,
            edition: Edition::current().to_string(),
        }
    }
}

impl From<Capabilities> for CapabilitiesDTO {
    fn from(caps: Capabilities) -> Self {
        // Defensive: FULL only - any caps passed is expected to be FULL; resource_policy hardcoded.
        Self {
            max_os_tabs: caps.max_os_tabs,
            max_apps_per_os_tab: caps.max_apps_per_os_tab,
            resource_policy: "Full/adaptive".to_string(),
            advanced_automation: caps.advanced_automation,
            advanced_customization: caps.advanced_customization,
            edition: Edition::current().to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn full_capabilities_is_10_10() {
        assert_eq!(FULL_CAPABILITIES.max_os_tabs, 10);
        assert_eq!(FULL_CAPABILITIES.max_apps_per_os_tab, 10);
        assert!(FULL_CAPABILITIES.advanced_resource_mgmt);
        assert!(FULL_CAPABILITIES.advanced_automation);
        assert!(FULL_CAPABILITIES.advanced_customization);
        assert_eq!(Capabilities::FULL, FULL_CAPABILITIES);
    }
    #[test]
    fn dto_full_only_serializes_camel_case() {
        let dto = CapabilitiesDTO::full_dto();
        assert_eq!(dto.max_os_tabs, 10);
        assert_eq!(dto.max_apps_per_os_tab, 10);
        assert_eq!(dto.resource_policy, "Full/adaptive");
        assert!(dto.advanced_automation);
        assert!(dto.advanced_customization);
        assert_eq!(dto.edition, "full");
        let v = serde_json::to_value(&dto).unwrap();
        assert_eq!(v["maxOsTabs"], 10);
        assert_eq!(v["maxAppsPerOsTab"], 10);
        assert_eq!(v["resourcePolicy"], "Full/adaptive");
        assert_eq!(v["advancedAutomation"], true);
        assert_eq!(v["advancedCustomization"], true);
        assert_eq!(v["edition"], "full");
        // No lite keys, no extra capability surface
        assert!(v.get("max_os_tabs").is_none());
    }
    #[test]
    fn from_edition_only_full() {
        let c = Capabilities::from_edition(Edition::Full);
        assert_eq!(c, FULL_CAPABILITIES);
        let dto: CapabilitiesDTO = c.into();
        assert_eq!(dto.resource_policy, "Full/adaptive");
    }
}
