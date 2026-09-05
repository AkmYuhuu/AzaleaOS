use crate::config::schema::{AppConfig, CURRENT_VERSION};
use crate::error::AzaleaError;
use std::path::{Path, PathBuf};

pub const CONFIG_FILE_NAME: &str = "config.json";

/// Ensure config directory exists.
pub fn ensure_config_dir(path: &Path) -> Result<(), AzaleaError> {
    std::fs::create_dir_all(path)
        .map_err(|e| AzaleaError::InvalidPath(format!("create_config_dir {}: {}", path.display(), e)))?;
    Ok(())
}

/// Returns the full config file path for the given config dir.
pub fn config_file_path(config_dir: &Path) -> PathBuf {
    config_dir.join(CONFIG_FILE_NAME)
}

/// Read config from `config_dir/config.json`.
/// - If file not exists -> Ok(default) without writing (lazy).
/// - If parse fails -> Err ConfigReadFailed.
/// - Validates via AppConfig::validate; migration bumps version if < CURRENT_VERSION.
pub fn read_config(config_dir: &Path) -> Result<AppConfig, AzaleaError> {
    let path = config_file_path(config_dir);
    if !path.exists() {
        log::info!("config.read missing -> defaults path={}", path.display());
        return Ok(AppConfig::default());
    }
    let bytes = std::fs::read(&path)
        .map_err(|e| AzaleaError::ConfigReadFailed(format!("read {}: {}", path.display(), e)))?;
    let mut cfg: AppConfig = serde_json::from_slice(&bytes)
        .map_err(|e| AzaleaError::ConfigReadFailed(format!("parse {}: {}", path.display(), e)))?;

    // Migration: bump version if older (currently just bump, no structural migration)
    if cfg.version < CURRENT_VERSION {
        log::info!(
            "config.migrate version {} -> {} path={}",
            cfg.version,
            CURRENT_VERSION,
            path.display()
        );
        cfg.version = CURRENT_VERSION;
    }
    // Ensure defaults for zero-value edge (serde default already covers missing fields)
    // Validate after migration
    cfg.validate()?;

    log::info!("config.read ok path={} version={}", path.display(), cfg.version);
    Ok(cfg)
}

/// Write config atomically: validate, ensure dir, write to config.json.tmp, rename.
/// Logs INFO with path (no sensitive data).
pub fn write_config(config_dir: &Path, cfg: &AppConfig) -> Result<(), AzaleaError> {
    cfg.validate().map_err(|e| {
        // Keep ConfigReadFailed as-is; caller (IPC) maps edition error to UnsupportedEdition
        e
    })?;

    ensure_config_dir(config_dir)?;

    let path = config_file_path(config_dir);
    let tmp = config_dir.join("config.json.tmp");

    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| AzaleaError::ConfigWriteFailed(format!("serialize: {}", e)))?;

    std::fs::write(&tmp, json.as_bytes())
        .map_err(|e| AzaleaError::ConfigWriteFailed(format!("write tmp {}: {}", tmp.display(), e)))?;

    std::fs::rename(&tmp, &path)
        .map_err(|e| AzaleaError::ConfigWriteFailed(format!("rename {} -> {}: {}", tmp.display(), path.display(), e)))?;

    log::info!("config.write ok path={} version={}", path.display(), cfg.version);
    Ok(())
}
