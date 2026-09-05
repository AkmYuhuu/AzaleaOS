use super::browse::FsEntry;

/// Recent paths stub for STEP 17.
/// Returns empty vec with log. Real impl could read from config recent or track last accesses.
pub fn get_recent() -> Vec<FsEntry> {
    log::info!("filesystem.recent stub - returning empty vec");
    Vec::new()
}
