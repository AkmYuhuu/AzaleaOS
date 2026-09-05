use sysinfo::{Pid, System};

use super::identity::ProcessIdentity;

/// Returns true if process with pid exists and is not zombie-like (sysinfo enumeration).
pub fn is_alive(pid: u32) -> bool {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    sys.process(Pid::from_u32(pid)).is_some()
}

/// Alias per spec task.
pub fn process_exists(pid: u32) -> bool {
    is_alive(pid)
}

/// Fetch identity for a single PID, if present.
pub fn get_process_info(pid: u32) -> Option<ProcessIdentity> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let proc_ = sys.process(Pid::from_u32(pid))?;
    let exe_path = proc_.exe().map(|p| p.to_string_lossy().to_string());
    let start_time = {
        let st = proc_.start_time();
        if st == 0 { None } else { Some(st) }
    };
    let ppid = proc_.parent().map(|p: Pid| p.as_u32());
    Some(ProcessIdentity {
        pid,
        name: proc_.name().to_string_lossy().to_string(),
        exe_path,
        start_time,
        ppid,
    })
}

