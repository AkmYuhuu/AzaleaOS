use super::capabilities::Capabilities;
use super::edition::Edition;
use crate::error::AzaleaError;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Managed application state - single source of truth for edition/capabilities/paths.
#[derive(Debug, Clone)]
pub struct AppState {
    pub edition: Edition,
    pub capabilities: Capabilities,
    pub config_dir: PathBuf,
    pub log_dir: PathBuf,
    pub cache_dir: PathBuf,
}

impl AppState {
    /// Build AppState from Tauri handle.
    /// Resolves edition-specific directories and ensures they exist.
    pub fn new(app_handle: &tauri::AppHandle) -> Result<Self, AzaleaError> {
        let edition = Edition::current();
        let capabilities = Capabilities::from_edition(edition);
        let base = resolve_base_dir(app_handle);
        let config_dir = base.clone();
        let log_dir = base.join("Logs");
        let cache_dir = base.join("Cache");

        ensure_dir(&config_dir)?;
        ensure_dir(&log_dir)?;
        ensure_dir(&cache_dir)?;

        Ok(Self {
            edition,
            capabilities,
            config_dir,
            log_dir,
            cache_dir,
        })
    }
}

fn resolve_base_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    // Preferred: Tauri app_local_data_dir - already edition-specific via identifier
    // com.azalea.azaleaos.full (e.g. %LOCALAPPDATA%\com.azalea.azaleaos.full).
    // Spec requires %LOCALAPPDATA%\AzaleaOS\Full; we normalize to spec path
    // by preferring LOCALAPPDATA\AzaleaOS\Full if available, else Tauri path.
    if let Ok(spec_base) = spec_base_dir() {
        return spec_base;
    }
    if let Ok(tauri_dir) = app_handle.path().app_local_data_dir() {
        return tauri_dir;
    }
    fallback_base_dir()
}

/// Spec path: %LOCALAPPDATA%\AzaleaOS\Full
fn spec_base_dir() -> Result<PathBuf, AzaleaError> {
    let local = std::env::var("LOCALAPPDATA")
        .map_err(|_| AzaleaError::InvalidPath("LOCALAPPDATA not set".into()))?;
    if local.trim().is_empty() {
        return Err(AzaleaError::InvalidPath("LOCALAPPDATA empty".into()));
    }
    Ok(Path::new(&local).join("AzaleaOS").join("Full"))
}

fn fallback_base_dir() -> PathBuf {
    if let Ok(v) = std::env::var("LOCALAPPDATA") {
        if !v.trim().is_empty() {
            return Path::new(&v).join("AzaleaOS").join("Full");
        }
    }
    // Last resort - temp dir (dev/CI without LOCALAPPDATA)
    std::env::temp_dir().join("AzaleaOS").join("Full")
}

fn ensure_dir(p: &Path) -> Result<(), AzaleaError> {
    std::fs::create_dir_all(p)
        .map_err(|e| AzaleaError::InvalidPath(format!("create_dir {}: {}", p.display(), e)))?;
    Ok(())
}
