/// GPU percent 0..100 - §14.1 gpu_percent: Option<f32>
/// MVP stub: no NVAPI/vendor SDK. Always None. Frontend should fallback gracefully.
/// Must not panic when GPU missing.
pub fn sample_gpu() -> Option<f32> {
    log::info!("gpu not available - stub returning None (NVAPI not in MVP)");
    None
}
