use super::descriptor::AppDescriptor;
use super::discovery;

/// In-memory registry - STEP 3 thin wrapper over discovery scan.
/// No persistent cache; each IPC calls scan_apps (deduped + sorted).
/// Stable IDs guarantee idempotence across calls.
pub fn get_all() -> Vec<AppDescriptor> {
    discovery::scan_apps()
}

pub fn get_by_id(id: &str) -> Option<AppDescriptor> {
    // Linear scan - honey: O(n), fine under ~1k apps; no index needed for STEP 3.
    get_all().into_iter().find(|d| d.id == id)
}
