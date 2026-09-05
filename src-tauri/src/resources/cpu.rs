use std::sync::{Mutex, OnceLock};
use sysinfo::System;

/// System CPU percent 0..100 - §14.1 cpu_percent
/// Uses sysinfo System::global_cpu_usage with cached System to provide delta.
/// First call after process start may return 0.0 until next refresh (~100ms+).
static CPU_SYS: OnceLock<Mutex<System>> = OnceLock::new();

pub fn sample_cpu_percent() -> f32 {
    // Fast path: already initialized → single refresh delta since last IPC ( §33 500-1000ms cadence ).
    if let Some(cell) = CPU_SYS.get() {
        let mut sys = match cell.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        sys.refresh_cpu_usage();
        let v = sys.global_cpu_usage();
        return if v.is_finite() { v.clamp(0.0, 100.0) } else { 0.0 };
    }
    // First call: seed with 120ms interval so first value is not 0/100 spike.
    let cell = CPU_SYS.get_or_init(|| {
        let mut s = System::new();
        s.refresh_cpu_usage();
        std::thread::sleep(std::time::Duration::from_millis(130));
        s.refresh_cpu_usage();
        Mutex::new(s)
    });
    let sys = match cell.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let v = sys.global_cpu_usage();
    if v.is_finite() { v.clamp(0.0, 100.0) } else { 0.0 }
}
