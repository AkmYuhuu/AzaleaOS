use std::path::{Path, PathBuf};

use crate::error::AzaleaError;

use super::browse::{get_metadata, FsEntry};

fn validate_name(name: &str) -> Result<(), AzaleaError> {
    let t = name.trim();
    if t.is_empty() {
        return Err(AzaleaError::InvalidPath("name must not be empty".into()));
    }
    if t.contains('\0') {
        return Err(AzaleaError::InvalidPath("name contains null byte".into()));
    }
    if t == "." || t == ".." {
        return Err(AzaleaError::InvalidPath("name must not be . or ..".into()));
    }
    // Invalid Windows filename chars: <>:"|?* plus path separators
    const INVALID: &[char] = &['<', '>', ':', '"', '|', '?', '*', '/', '\\'];
    if t.chars().any(|c| INVALID.contains(&c)) {
        return Err(AzaleaError::InvalidPath(format!("name contains invalid chars: {}", t)));
    }
    // Control chars
    if t.chars().any(|c| c.is_control()) {
        return Err(AzaleaError::InvalidPath("name contains control char".into()));
    }
    Ok(())
}

fn validate_path_input(path: &str) -> Result<(), AzaleaError> {
    if path.trim().is_empty() {
        return Err(AzaleaError::InvalidPath("path must not be empty".into()));
    }
    if path.contains('\0') {
        return Err(AzaleaError::InvalidPath("path contains null byte".into()));
    }
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

pub fn create_folder(parent: &str, name: &str) -> Result<FsEntry, AzaleaError> {
    validate_path_input(parent)?;
    validate_name(name)?;
    let parent_path = PathBuf::from(parent);
    let meta = std::fs::metadata(&parent_path).map_err(|e| map_io_err(e, &format!("create_folder parent {}", parent)))?;
    if !meta.is_dir() {
        return Err(AzaleaError::InvalidPath(format!("parent not a directory: {}", parent)));
    }
    let new_path = parent_path.join(name.trim());
    if new_path.exists() {
        return Err(AzaleaError::InvalidPath(format!("already exists: {}", new_path.display())));
    }
    std::fs::create_dir(&new_path).map_err(|e| map_io_err(e, &format!("create_dir {}", new_path.display())))?;
    log::info!("filesystem.create_folder parent={} name={} path={}", parent, name, new_path.display());
    get_metadata(&new_path.to_string_lossy())
}

pub fn rename(old: &str, new_name: &str) -> Result<FsEntry, AzaleaError> {
    validate_path_input(old)?;
    validate_name(new_name)?;
    let old_path = PathBuf::from(old);
    if !old_path.exists() {
        return Err(AzaleaError::InvalidPath(format!("path not found: {}", old)));
    }
    let parent = old_path.parent().ok_or_else(|| AzaleaError::InvalidPath("cannot determine parent".into()))?;
    let new_path = parent.join(new_name.trim());
    if new_path.exists() {
        return Err(AzaleaError::InvalidPath(format!("target already exists: {}", new_path.display())));
    }
    std::fs::rename(&old_path, &new_path).map_err(|e| map_io_err(e, &format!("rename {} -> {}", old, new_path.display())))?;
    log::info!("filesystem.rename old={} new={} new_path={}", old, new_name, new_path.display());
    get_metadata(&new_path.to_string_lossy())
}

pub fn move_entry(src: &str, dst: &str) -> Result<(), AzaleaError> {
    validate_path_input(src)?;
    validate_path_input(dst)?;
    let src_path = PathBuf::from(src);
    if !src_path.exists() {
        return Err(AzaleaError::InvalidPath(format!("src not found: {}", src)));
    }
    let dst_path = PathBuf::from(dst);
    let dst_meta = std::fs::metadata(&dst_path).map_err(|e| map_io_err(e, &format!("move dst {}", dst)))?;
    if !dst_meta.is_dir() {
        return Err(AzaleaError::InvalidPath(format!("dst not a directory: {}", dst)));
    }
    let file_name = src_path.file_name().ok_or_else(|| AzaleaError::InvalidPath("src has no file name".into()))?;
    let target = dst_path.join(file_name);
    if target.exists() {
        return Err(AzaleaError::InvalidPath(format!("target already exists: {}", target.display())));
    }
    // Try rename (fast, same volume). If cross-device, fallback to copy+delete.
    match std::fs::rename(&src_path, &target) {
        Ok(_) => {
            log::info!("filesystem.move src={} dst={} target={}", src, dst, target.display());
            Ok(())
        }
        Err(e) => {
            // Cross-device fallback: copy recursively then delete
            let msg = e.to_string().to_lowercase();
            if msg.contains("cross-device") || msg.contains("cross device") || e.kind() == std::io::ErrorKind::Other {
                copy_recursive(&src_path, &target)?;
                // delete src after successful copy
                delete_inner(&src_path)?;
                log::info!("filesystem.move (copy+delete) src={} dst={} target={}", src, dst, target.display());
                Ok(())
            } else {
                Err(map_io_err(e, &format!("move {} -> {}", src, target.display())))
            }
        }
    }
}

pub fn copy_entry(src: &str, dst: &str) -> Result<(), AzaleaError> {
    validate_path_input(src)?;
    validate_path_input(dst)?;
    let src_path = PathBuf::from(src);
    if !src_path.exists() {
        return Err(AzaleaError::InvalidPath(format!("src not found: {}", src)));
    }
    let dst_path = PathBuf::from(dst);
    let dst_meta = std::fs::metadata(&dst_path).map_err(|e| map_io_err(e, &format!("copy dst {}", dst)))?;
    if !dst_meta.is_dir() {
        return Err(AzaleaError::InvalidPath(format!("dst not a directory: {}", dst)));
    }
    let file_name = src_path.file_name().ok_or_else(|| AzaleaError::InvalidPath("src has no file name".into()))?;
    let target = dst_path.join(file_name);
    if target.exists() {
        return Err(AzaleaError::InvalidPath(format!("target already exists: {}", target.display())));
    }
    copy_recursive(&src_path, &target)?;
    log::info!("filesystem.copy src={} dst={} target={}", src, dst, target.display());
    Ok(())
}

fn copy_recursive(src: &Path, dst: &Path) -> Result<(), AzaleaError> {
    let meta = std::fs::metadata(src).map_err(|e| map_io_err(e, &format!("copy metadata {}", src.display())))?;
    if meta.is_file() {
        std::fs::copy(src, dst).map_err(|e| map_io_err(e, &format!("copy file {} -> {}", src.display(), dst.display())))?;
        return Ok(());
    }
    // dir
    std::fs::create_dir_all(dst).map_err(|e| map_io_err(e, &format!("create_dir_all {}", dst.display())))?;
    for entry in walkdir::WalkDir::new(src).min_depth(1) {
        let entry = entry.map_err(|e| AzaleaError::InvalidPath(format!("walkdir: {}", e)))?;
        let rel = entry.path().strip_prefix(src).map_err(|e| AzaleaError::InvalidPath(format!("strip_prefix: {}", e)))?;
        let dest = dst.join(rel);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&dest).map_err(|e| map_io_err(e, &format!("create_dir {}", dest.display())))?;
        } else {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).map_err(|e| map_io_err(e, &format!("create_dir_all parent {}", parent.display())))?;
            }
            std::fs::copy(entry.path(), &dest).map_err(|e| map_io_err(e, &format!("copy {} -> {}", entry.path().display(), dest.display())))?;
        }
    }
    Ok(())
}

pub fn delete_entry(path: &str) -> Result<(), AzaleaError> {
    validate_path_input(path)?;
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err(AzaleaError::InvalidPath(format!("path not found: {}", path)));
    }
    delete_inner(&p)?;
    log::info!("filesystem.delete path={}", path);
    Ok(())
}

fn delete_inner(p: &Path) -> Result<(), AzaleaError> {
    let meta = std::fs::metadata(p).map_err(|e| map_io_err(e, &format!("delete metadata {}", p.display())))?;
    if meta.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| map_io_err(e, &format!("remove_dir_all {}", p.display())))?;
    } else {
        std::fs::remove_file(p).map_err(|e| map_io_err(e, &format!("remove_file {}", p.display())))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filesystem::browse;

    fn tmp() -> PathBuf {
        let base = std::env::temp_dir().join(format!("azalea-ops-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        base
    }

    #[test]
    fn create_rename_delete_roundtrip() {
        let base = tmp();
        let created = create_folder(base.to_string_lossy().as_ref(), "newfold").unwrap();
        assert_eq!(created.name, "newfold");
        let listed = browse::list_dir(base.to_string_lossy().as_ref()).unwrap();
        assert!(listed.iter().any(|e| e.name == "newfold"));
        let renamed = rename(&created.path, "renamed").unwrap();
        assert_eq!(renamed.name, "renamed");
        assert!(!PathBuf::from(&created.path).exists());
        assert!(PathBuf::from(&renamed.path).exists());
        delete_entry(&renamed.path).unwrap();
        assert!(!PathBuf::from(&renamed.path).exists());
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn invalid_name_rejected() {
        let base = tmp();
        let err = create_folder(base.to_string_lossy().as_ref(), "").unwrap_err();
        assert!(err.to_string().contains("InvalidPath"));
        let err2 = create_folder(base.to_string_lossy().as_ref(), "a:b").unwrap_err();
        assert!(err2.to_string().contains("InvalidPath"));
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn copy_file() {
        let base = tmp();
        let src = base.join("src.txt");
        std::fs::write(&src, b"data").unwrap();
        let dst_dir = base.join("dst");
        std::fs::create_dir(&dst_dir).unwrap();
        copy_entry(src.to_string_lossy().as_ref(), dst_dir.to_string_lossy().as_ref()).unwrap();
        assert!(dst_dir.join("src.txt").exists());
        assert_eq!(std::fs::read(dst_dir.join("src.txt")).unwrap(), b"data");
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn move_file() {
        let base = tmp();
        let src = base.join("a.txt");
        std::fs::write(&src, b"hi").unwrap();
        let dst = base.join("dst2");
        std::fs::create_dir(&dst).unwrap();
        move_entry(src.to_string_lossy().as_ref(), dst.to_string_lossy().as_ref()).unwrap();
        assert!(!src.exists());
        assert!(dst.join("a.txt").exists());
        std::fs::remove_dir_all(&base).unwrap();
    }
}
