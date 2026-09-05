use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::error::AzaleaError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FsKind {
    File,
    Folder,
    Drive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub kind: FsKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<u64>,
    pub is_hidden: bool,
    // Compatibility: frontend expects sizeKb/modifiedAt; provide aliases via extra optional fields?
    // Keep canonical fields; frontend service maps size_bytes->sizeKb if needed. We also emit camelCase sizeBytes.
}

// ---- validation ----

fn validate_path_input(path: &str) -> Result<(), AzaleaError> {
    if path.trim().is_empty() {
        return Err(AzaleaError::InvalidPath("path must not be empty".into()));
    }
    if path.contains('\0') {
        return Err(AzaleaError::InvalidPath("path contains null byte".into()));
    }
    // Reject control chars that are invalid in Windows paths for safety
    // Task says reject invalid chars example \0; we also guard empty.
    // Do not over-reject: allow normal Windows paths including colon, slash, dot.
    Ok(())
}

fn map_io_err(e: std::io::Error, ctx: &str) -> AzaleaError {
    use std::io::ErrorKind;
    match e.kind() {
        ErrorKind::PermissionDenied => {
            log::warn!("filesystem.access_denied ctx={} err={}", ctx, e);
            AzaleaError::FilesystemAccessDenied(format!("{}: {}", ctx, e))
        }
        ErrorKind::NotFound => AzaleaError::InvalidPath(format!("{}: {}", ctx, e)),
        _ => {
            // Distinguish InvalidPath vs AccessDenied heuristically
            let msg = e.to_string().to_lowercase();
            if msg.contains("access is denied") || msg.contains("permission") {
                log::warn!("filesystem.access_denied ctx={} err={}", ctx, e);
                AzaleaError::FilesystemAccessDenied(format!("{}: {}", ctx, e))
            } else {
                AzaleaError::InvalidPath(format!("{}: {}", ctx, e))
            }
        }
    }
}

fn entry_from_path(p: &Path) -> Result<FsEntry, AzaleaError> {
    let metadata = std::fs::metadata(p).map_err(|e| map_io_err(e, &format!("metadata {}", p.display())))?;
    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| p.to_string_lossy().to_string());
    // For root like C:\ , file_name is None, use path string
    let display_name = if name.is_empty() {
        p.to_string_lossy().to_string()
    } else {
        name
    };
    let kind = if metadata.is_dir() {
        // Heuristic drive detection: C:\ or D:\ style
        let s = p.to_string_lossy();
        if s.len() == 3 && s.chars().nth(1) == Some(':') && (s.ends_with('\\') || s.ends_with('/')) {
            FsKind::Drive
        } else {
            FsKind::Folder
        }
    } else {
        FsKind::File
    };
    let size_bytes = if metadata.is_file() { Some(metadata.len()) } else { None };
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs()));
    // MVP hidden false; real check would read windows attributes
    let is_hidden = false;
    Ok(FsEntry {
        name: display_name,
        path: p.to_string_lossy().to_string(),
        kind,
        size_bytes,
        modified_at,
        is_hidden,
    })
}

/// Validate and list directory. Sort folders first then files by name case-insensitive.
pub fn list_dir(path: &str) -> Result<Vec<FsEntry>, AzaleaError> {
    validate_path_input(path)?;
    let p = PathBuf::from(path);
    // Check exists and is_dir with proper error mapping
    let meta = std::fs::metadata(&p).map_err(|e| map_io_err(e, &format!("list_dir {}", path)))?;
    if !meta.is_dir() {
        return Err(AzaleaError::InvalidPath(format!("not a directory: {}", path)));
    }
    let read = std::fs::read_dir(&p).map_err(|e| map_io_err(e, &format!("read_dir {}", path)))?;
    let mut entries: Vec<FsEntry> = Vec::new();
    for item in read {
        let entry = match item {
            Ok(e) => e,
            Err(e) => {
                log::warn!("filesystem.list skip entry err={}", e);
                continue;
            }
        };
        let ep = entry.path();
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(e) => {
                log::warn!("filesystem.list skip metadata err={} path={}", e, ep.display());
                continue;
            }
        };
        let name = ep.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
        if name.is_empty() {
            continue;
        }
        let kind = if meta.is_dir() { FsKind::Folder } else { FsKind::File };
        let size_bytes = if meta.is_file() { Some(meta.len()) } else { None };
        let modified_at = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs()));
        entries.push(FsEntry {
            name,
            path: ep.to_string_lossy().to_string(),
            kind,
            size_bytes,
            modified_at,
            is_hidden: false,
        });
    }
    // Sort folders first then files, each by name case-insensitive
    entries.sort_by(|a, b| {
        let ak = match a.kind { FsKind::Folder | FsKind::Drive => 0, FsKind::File => 1 };
        let bk = match b.kind { FsKind::Folder | FsKind::Drive => 0, FsKind::File => 1 };
        if ak != bk {
            return ak.cmp(&bk);
        }
        a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });
    log::info!("filesystem.list path={} count={}", path, entries.len());
    Ok(entries)
}

/// Get metadata for single path (file/folder/drive)
pub fn get_metadata(path: &str) -> Result<FsEntry, AzaleaError> {
    validate_path_input(path)?;
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err(AzaleaError::InvalidPath(format!("path not found: {}", path)));
    }
    let e = entry_from_path(&p)?;
    log::info!("filesystem.get_metadata path={} kind={:?}", path, e.kind);
    Ok(e)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_dir_invalid_empty() {
        let err = list_dir("").unwrap_err();
        assert!(err.to_string().contains("InvalidPath"));
    }

    #[test]
    fn list_dir_invalid_null_byte() {
        let err = list_dir("C:\0Users").unwrap_err();
        assert!(err.to_string().contains("InvalidPath"));
    }

    #[test]
    fn list_dir_not_found_invalid_path() {
        let err = list_dir("C:\\__azalea_nonexistent_12345__").unwrap_err();
        assert!(err.to_string().contains("InvalidPath") || err.to_string().contains("FilesystemAccessDenied"));
    }

    #[test]
    fn get_metadata_invalid_empty() {
        let err = get_metadata("").unwrap_err();
        assert!(err.to_string().contains("InvalidPath"));
    }

    #[test]
    fn list_dir_temp_roundtrip() {
        let base = std::env::temp_dir().join(format!("azalea-fs-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("a.txt"), b"hello").unwrap();
        std::fs::create_dir(base.join("sub")).unwrap();
        let entries = list_dir(base.to_string_lossy().as_ref()).unwrap();
        assert!(entries.iter().any(|e| e.name == "a.txt" && e.kind == FsKind::File));
        assert!(entries.iter().any(|e| e.name == "sub" && e.kind == FsKind::Folder));
        // folders first
        assert_eq!(entries[0].kind, FsKind::Folder);
        std::fs::remove_dir_all(&base).unwrap();
    }
}
