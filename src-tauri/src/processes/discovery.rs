use sysinfo::{Pid, System};

use super::identity::ProcessIdentity;

/// Scan all processes via sysinfo - on-demand per IPC.
/// Stable sampling: single full scan, no background timer (MVP).
/// Caller may filter (e.g. Chrome/VS Code/Notepad) if needed.
pub fn list_processes() -> Vec<ProcessIdentity> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    sys.processes()
        .iter()
        .map(|(pid, proc_) | {
            let pid_u32 = pid.as_u32();
            let name = proc_.name().to_string_lossy().to_string();
            let exe_path = proc_.exe().map(|p| p.to_string_lossy().to_string());
            let start_time = {
                let st = proc_.start_time();
                if st == 0 { None } else { Some(st) }
            };
            let ppid = proc_.parent().map(|p: Pid| p.as_u32());
            ProcessIdentity {
                pid: pid_u32,
                name,
                exe_path,
                start_time,
                ppid,
            }
        })
        .collect()
}

