use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::{Pid, System};

/// Process resource snapshot - §8.2 + §9.3.
/// working_set_bytes ≈ sysinfo memory() (bytes \(WorkingSetSize via GetProcessMemoryInfo\)).
/// private_bytes left None on MVP (sysinfo doesn't expose commit/private separately).
/// timestamp = unix millis.
/// cpu_percent may be 0 on first sample - sysinfo needs interval between refreshes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMetrics {
    pub pid: u32,
    pub cpu_percent: f32,
    pub working_set_bytes: u64,
    pub private_bytes: Option<u64>,
    pub timestamp: u64,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Sample all processes - single refresh (MVP). For accurate CPU, caller should
/// call twice with ~100-200ms gap and use second sample. Single-shot IPC returns
/// immediate value (may be 0 on first call after boot per sysinfo docs).
pub fn sample_processes() -> Vec<ProcessMetrics> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let ts = now_millis();
    sys.processes()
        .iter()
        .map(|(pid, p)| {
            // sysinfo memory is in KiB - convert to bytes for working_set_bytes
            let working_set_bytes = p.memory();
            ProcessMetrics {
                pid: pid.as_u32(),
                cpu_percent: p.cpu_usage(),
                working_set_bytes,
                private_bytes: None,
                timestamp: ts,
            }
        })
        .collect()
}

/// Sample single PID. Returns None if PID not found.
pub fn sample_one(pid: u32) -> Option<ProcessMetrics> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let proc_ = sys.process(Pid::from_u32(pid))?;
    let working_set_bytes = proc_.memory();
    Some(ProcessMetrics {
        pid,
        cpu_percent: proc_.cpu_usage(),
        working_set_bytes,
        private_bytes: None,
        timestamp: now_millis(),
    })
}

/// More accurate per-PID CPU by doing two refreshes with a short delay.
/// Blocks ~150ms - only use when accuracy required, not for bulk list.
pub fn sample_one_accurate(pid: u32) -> Option<ProcessMetrics> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    // sysinfo recommends minimum interval; 150ms is low-overhead compromise.
    std::thread::sleep(std::time::Duration::from_millis(150));
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let proc_ = sys.process(Pid::from_u32(pid))?;
    let working_set_bytes = proc_.memory();
    Some(ProcessMetrics {
        pid,
        cpu_percent: proc_.cpu_usage(),
        working_set_bytes,
        private_bytes: None,
        timestamp: now_millis(),
    })
}



