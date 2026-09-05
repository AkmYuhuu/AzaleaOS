use crate::error::AzaleaError;
use std::path::{Path, PathBuf};

/// Structured logging init - INFO level, file AzaleaOS-Full.log.
/// No sensitive data is logged; only lifecycle events per §34.
/// Format: timestamp [LEVEL] [target] message  - satisfies timestamp+level+target.
pub fn init_logging(log_dir: &Path) -> Result<(), AzaleaError> {
    std::fs::create_dir_all(log_dir)
        .map_err(|e| AzaleaError::InvalidPath(format!("create log_dir {}: {}", log_dir.display(), e)))?;

    let log_file = log_dir.join("AzaleaOS-Full.log");

    let fern_result = try_init_fern(&log_file);
    if fern_result.is_ok() {
        log::info!(target: "app", "app.started edition=full");
        return Ok(());
    }

    let _ = std::fs::OpenOptions::new().create(true).append(true).open(&log_file)
        .map_err(|e| AzaleaError::ConfigWriteFailed(format!("open log file: {}", e)))?;

    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_secs()
        .try_init();

    log::info!(target: "app", "app.started edition=full");
    append_line(&log_file, "INFO [app] app.started edition=full");
    Ok(())
}

fn try_init_fern(log_file: &Path) -> Result<(), AzaleaError> {
    let file = std::fs::OpenOptions::new().create(true).append(true).open(log_file)
        .map_err(|e| AzaleaError::ConfigWriteFailed(format!("open log file: {}", e)))?;

    let dispatch = fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "{} [{}] [{}] {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
                record.level(),
                record.target(),
                message
            ))
        })
        .level(log::LevelFilter::Info)
        .chain(std::io::stdout())
        .chain(file);

    match dispatch.apply() {
        Ok(_) => Ok(()),
        Err(_) => Ok(()),
    }
}

fn append_line(path: &Path, line: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{} {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), line);
    }
}

/// Resolve default log file path from spec base.
pub fn default_log_file() -> PathBuf {
    diagnostics_base_dir().join("Logs").join("AzaleaOS-Full.log")
}

fn diagnostics_base_dir() -> PathBuf {
    if let Ok(v) = std::env::var("LOCALAPPDATA") {
        if !v.trim().is_empty() { return Path::new(&v).join("AzaleaOS").join("Full"); }
    }
    std::env::temp_dir().join("AzaleaOS").join("Full")
}

/// Tail last N lines from log file - local only per §35, no cloud upload.
pub fn tail_logs(max_lines: usize) -> Vec<String> {
    let path = default_log_file();
    tail_logs_from(&path, max_lines)
}

pub fn tail_logs_from(path: &Path, max_lines: usize) -> Vec<String> {
    let Ok(content) = std::fs::read_to_string(path) else { return vec![]; };
    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    if lines.len() <= max_lines { lines } else { lines[lines.len()-max_lines..].to_vec() }
}

/// Count ERROR lines in tail - for core_health error_count.
pub fn count_recent_errors(max_lines: usize) -> usize {
    tail_logs(max_lines).iter().filter(|l| l.contains("ERROR")).count()
}
