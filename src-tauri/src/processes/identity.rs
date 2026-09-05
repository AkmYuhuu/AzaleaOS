use serde::{Deserialize, Serialize};

/// Process identity - §8.1. DTO-ready with camelCase for Tauri IPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessIdentity {
    pub pid: u32,
    pub name: String,
    pub exe_path: Option<String>,
    pub start_time: Option<u64>,
    pub ppid: Option<u32>,
}

impl ProcessIdentity {
    pub fn new(pid: u32, name: impl Into<String>) -> Self {
        Self {
            pid,
            name: name.into(),
            exe_path: None,
            start_time: None,
            ppid: None,
        }
    }
}

/// Helpers - currently trivial, reserved for enrichment/filters.
pub fn is_valid_identity(p: &ProcessIdentity) -> bool {
    p.pid != 0 && !p.name.is_empty()
}

/// Optional enrichment hook - placeholder for future windows API fallback.
pub fn enrich_with_exe_path(mut identity: ProcessIdentity, exe: Option<String>) -> ProcessIdentity {
    identity.exe_path = exe;
    identity
}

