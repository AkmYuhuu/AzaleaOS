use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

static START: OnceLock<Instant> = OnceLock::new();
static START_SYSTEM: OnceLock<SystemTime> = OnceLock::new();

fn uptime_secs() -> u64 {
    START.get_or_init(|| Instant::now());
    START_SYSTEM.get_or_init(SystemTime::now);
    START.get().map(|i| i.elapsed().as_secs()).unwrap_or(0)
}

fn now_millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Core health per STEP 19 - status ok|degraded, uptime, memory, error_count
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreHealth {
    pub status: String,
    pub uptime_secs: u64,
    pub uptime_human: String,
    pub memory_usage_bytes: u64,
    pub error_count: usize,
    pub process_count: usize,
    pub timestamp: u64,
}

fn current_process_memory() -> u64 {
    // Use sysinfo for current pid memory - WorkingSet/private
    let pid = std::process::id();
    if let Some(m) = crate::processes::metrics::sample_one(pid) {
        return m.working_set_bytes;
    }
    // fallback: sysinfo direct
    use sysinfo::{Pid, System};
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    sys.process(Pid::from_u32(pid)).map(|p| p.memory()).unwrap_or(0)
}

pub fn core_health() -> CoreHealth {
    let ups = uptime_secs();
    let memory_usage_bytes = current_process_memory();
    let error_count = crate::diagnostics::logging::count_recent_errors(200);
    // process_count: number of system processes as liveness signal
    let process_count = {
        use sysinfo::System;
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        sys.processes().len()
    };
    // degraded if error burst or huge memory
    let status = if error_count > 20 { "degraded".to_string() }
    else if memory_usage_bytes > 800_000_000 { "degraded".to_string() }
    else { "ok".to_string() };

    let uptime_human = format!("{}s", ups);
    // structured log per §34
    log::info!(target: "core", "core.health status={} uptime={}s mem={} errors={}", status, ups, memory_usage_bytes, error_count);

    CoreHealth { status, uptime_secs: ups, uptime_human, memory_usage_bytes, error_count, process_count, timestamp: now_millis() }
}
