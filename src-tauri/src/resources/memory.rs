use sysinfo::System;

/// Returns (total, used, available) in bytes - §14.1 ram_total/ram_used/ram_available
/// sysinfo reports bytes since 0.30+ (not KB). Keep bytes for frontend.
pub fn sample_memory() -> (u64, u64, u64) {
    let mut sys = System::new();
    sys.refresh_memory();
    let total = sys.total_memory();
    let used = sys.used_memory();
    let available = sys.available_memory();
    // Defensive: ensure available never exceeds total due to race
    let available = available.min(total);
    // Derive used if sys reports inconsistent (some platforms)
    let used = if used > total { total - available } else { used };
    (total, used, available)
}
