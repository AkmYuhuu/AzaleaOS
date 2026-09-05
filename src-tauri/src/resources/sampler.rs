use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::resources::{cpu, disk, gpu, memory, network};

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// System snapshot - §14.1
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResourceSnapshot {
    pub cpu_percent: f32,
    pub ram_total: u64,
    pub ram_used: u64,
    pub ram_available: u64,
    pub gpu_percent: Option<f32>,
    pub disk_activity: f32,
    pub network_rx: u64,
    pub network_tx: u64,
    pub timestamp: u64,
}

/// Process snapshot - §14.2
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessResourceSnapshot {
    pub pid: u32,
    pub cpu_percent: f32,
    pub working_set_bytes: u64,
    pub private_bytes: Option<u64>,
    pub timestamp: u64,
}

/// On-demand system snapshot per §33 (UI cadence 500-1000ms throttled in frontend).
/// No background scheduler in STEP 10 - IPC polls on demand.
/// Future: add throttled broadcast channel if event volume needs coalescing.
pub fn snapshot_system() -> SystemResourceSnapshot {
    let cpu_percent = cpu::sample_cpu_percent();
    let (ram_total, ram_used, ram_available) = memory::sample_memory();
    let gpu_percent = gpu::sample_gpu();
    let disk_activity = disk::sample_disk();
    let (network_rx, network_tx) = network::sample_network();

    // Clamp invariants for frontend safety
    let cpu_percent = if cpu_percent.is_finite() {
        cpu_percent.clamp(0.0, 100.0)
    } else {
        0.0
    };
    let disk_activity = if disk_activity.is_finite() {
        disk_activity.clamp(0.0, 100.0)
    } else {
        0.0
    };

    SystemResourceSnapshot {
        cpu_percent,
        ram_total,
        ram_used,
        ram_available,
        gpu_percent,
        disk_activity,
        network_rx,
        network_tx,
        timestamp: now_millis(),
    }
}

/// On-demand process snapshot via processes::metrics - §14.2
pub fn snapshot_process(pid: u32) -> Option<ProcessResourceSnapshot> {
    let m = crate::processes::metrics::sample_one(pid)?;
    Some(ProcessResourceSnapshot {
        pid: m.pid,
        cpu_percent: if m.cpu_percent.is_finite() {
            m.cpu_percent.clamp(0.0, 100.0)
        } else {
            0.0
        },
        working_set_bytes: m.working_set_bytes,
        private_bytes: m.private_bytes,
        timestamp: m.timestamp,
    })
}
