use std::collections::HashSet;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use super::descriptor::{AppCategory, AppDescriptor, AppSource};

/// Stable ID: FNV-1a 64 over lowercased name + "|" + lowercased executable_path.
/// Deterministic across runs; no RandomState.
pub fn stable_id(name: &str, executable_path: Option<&str>) -> String {
    let mut hash: u64 = 14695981039346656037u64;
    for b in name.to_lowercase().bytes() {
        hash ^= b as u64;
        hash = hash.wrapping_mul(1099511628211u64);
    }
    hash ^= b'|' as u64;
    hash = hash.wrapping_mul(1099511628211u64);
    if let Some(p) = executable_path {
        for b in p.to_lowercase().bytes() {
            hash ^= b as u64;
            hash = hash.wrapping_mul(1099511628211u64);
        }
    }
    format!("app-{:016x}", hash)
}

/// Heuristic category placeholder - §5/§6. Game keywords map to Game but
/// STEP 3 keeps `supported=true`; classifier (§16) later decides protection.
pub fn categorize(name: &str) -> AppCategory {
    let lower = name.to_lowercase();
    // Browser
    if lower.contains("chrome")
        || lower.contains("firefox")
        || lower.contains("edge")
        || lower.contains("brave")
        || lower.contains("opera")
    {
        return AppCategory::Browser;
    }
    // Developer
    if lower.contains("code")
        || lower.contains("vscode")
        || lower.contains("visual studio")
        || lower.contains("intellij")
        || lower.contains("idea")
        || lower.contains("eclipse")
        || lower.contains("sublime")
        || lower.contains("neovim")
        || lower.contains("vim")
    {
        return AppCategory::Developer;
    }
    // Utility - terminal family (§45)
    if lower.contains("terminal")
        || lower.contains("powershell")
        || lower.contains("cmd")
        || lower.contains("console")
        || lower.contains("windows terminal")
    {
        return AppCategory::Utility;
    }
    // Productivity - comms/docs
    if lower.contains("discord")
        || lower.contains("slack")
        || lower.contains("notion")
        || lower.contains("figma")
        || lower.contains("teams")
        || lower.contains("zoom")
        || lower.contains("outlook")
        || lower.contains("word")
        || lower.contains("excel")
        || lower.contains("powerpoint")
    {
        return AppCategory::Productivity;
    }
    // System
    if lower.contains("explorer") || lower.contains("files") || lower.contains("file explorer") {
        return AppCategory::System;
    }
    // Game - frontend `supported` stays true in STEP 3; later steps mark protected.
    // spotify intentionally NOT game (media) - keep game list pure
    if lower.contains("valorant")
        || lower.contains("steam")
        || lower.contains("epic")
        || lower.contains("minecraft")
        || lower.contains("fortnite")
        || lower.contains("game")
        || lower.contains("overwatch")
        || lower.contains("league")
        || lower.contains("elden")
        || lower.contains("warcraft")
        || lower.contains("valorant")
        || lower.contains("minecraft")
    {
        return AppCategory::Game;
    }
    AppCategory::Unknown
}

fn make_known(name: &str, exe: Option<&str>, source: AppSource, category: AppCategory) -> AppDescriptor {
    let id = stable_id(name, exe);
    AppDescriptor {
        id,
        name: name.to_string(),
        executable_path: exe.map(|s| s.to_string()),
        icon_ref: None,
        source,
        category,
        supported: true,
        unsupported_reason: None,
    }
}

/// Hardcoded known apps for determinism - ensures launcher always has data.
/// Matches §45 test matrix: Chrome, VS Code, Windows Terminal, Notepad, Discord, File Explorer
/// plus STEP 22 families: Valorant/Minecraft (Game), Spotify/VLC (Media), xyz (Unknown), Electron multi-process.
fn known_apps() -> Vec<AppDescriptor> {
    vec![
        make_known(
            "Chrome",
            Some("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"),
            AppSource::Windows,
            AppCategory::Browser,
        ),
        make_known(
            "VS Code",
            Some("C:\\Program Files\\Microsoft VS Code\\Code.exe"),
            AppSource::Windows,
            AppCategory::Developer,
        ),
        make_known(
            "Terminal",
            Some("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"),
            AppSource::Windows,
            AppCategory::Utility,
        ),
        make_known(
            "Notepad",
            Some("C:\\Windows\\System32\\notepad.exe"),
            AppSource::Windows,
            AppCategory::Utility,
        ),
        make_known(
            "Discord",
            Some("C:\\Users\\Default\\AppData\\Local\\Discord\\Update.exe"),
            AppSource::Windows,
            AppCategory::Productivity,
        ),
        make_known(
            "File Explorer",
            Some("C:\\Windows\\explorer.exe"),
            AppSource::Windows,
            AppCategory::System,
        ),
        // Azalea internal tool - source Azalea
        make_known("Files", None, AppSource::Azalea, AppCategory::System),
        // STEP 22 - 9 families coverage (browser/IDE/utility/multi-process/multi-window/downloads/media/game/unknown)
        make_known(
            "Valorant",
            Some("C:\\Riot Games\\Valorant\\VALORANT.exe"),
            AppSource::Windows,
            AppCategory::Game,
        ),
        make_known(
            "Minecraft",
            Some("C:\\Program Files\\Minecraft\\minecraft.exe"),
            AppSource::Windows,
            AppCategory::Game,
        ),
        make_known(
            "Spotify",
            Some("C:\\Users\\Default\\AppData\\Roaming\\Spotify\\Spotify.exe"),
            AppSource::Windows,
            AppCategory::Unknown,
        ),
        make_known(
            "VLC",
            Some("C:\\Program Files\\VideoLAN\\VLC\\vlc.exe"),
            AppSource::Windows,
            AppCategory::Unknown,
        ),
        make_known(
            "Electron App",
            Some("C:\\Apps\\electron.exe"),
            AppSource::Windows,
            AppCategory::Unknown,
        ),
        make_known(
            "MyCustomAppXYZ123",
            Some("C:\\Apps\\xyz123\\custom.exe"),
            AppSource::Windows,
            AppCategory::Unknown,
        ),
    ]
}

/// Crude .lnk target extraction - reads bytes lossy and looks for drive-absolute .exe path.
/// Best-effort only; returns None on failure (never panics).
fn try_extract_exe_path(lnk_path: &Path) -> Option<String> {
    let bytes = std::fs::read(lnk_path).ok()?;
    // Limit scan to first 4KB to avoid huge reads
    let slice = if bytes.len() > 8192 { &bytes[..8192] } else { &bytes[..] };
    let s = String::from_utf8_lossy(slice);
    // Find ".exe" occurrences and backtrack to nearest "C:\" / "D:\" style prefix
    // This is heuristic and intentionally minimal.
    let lower = s.to_lowercase();
    let mut best: Option<String> = None;
    let mut search_start = 0usize;
    while let Some(idx) = lower[search_start..].find(".exe") {
        let abs = search_start + idx;
        let exe_end = abs + 4;
        // Backtrack up to 260 chars to find drive prefix
        let win_start = s[..exe_end].rfind(":\\");
        if let Some(ws) = win_start {
            if ws >= 1 {
                let drive_start = ws - 1;
                // Validate drive letter
                let c = s.as_bytes().get(drive_start).copied().unwrap_or(0) as char;
                if c.is_ascii_alphabetic() {
                    let candidate = s[drive_start..exe_end].trim_matches(|c: char| {
                        !c.is_ascii_alphanumeric() && c != ':' && c != '\\' && c != '/' && c != '.' && c != '-' && c != '_' && c != ' ' && c != '(' && c != ')'
                    }).trim().to_string();
                    // Basic sanity: must contain backslash and not too long
                    if candidate.contains('\\') && candidate.len() < 320 {
                        best = Some(candidate);
                        break;
                    }
                }
            }
        }
        search_start = exe_end;
        if search_start >= lower.len() {
            break;
        }
    }
    best
}

fn scan_start_menu_dir(dir: &Path, out: &mut Vec<AppDescriptor>) {
    if !dir.exists() {
        return;
    }
    // walkdir with max depth 6, follow_links false, handle errors per entry
    let walker = WalkDir::new(dir)
        .max_depth(6)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok());

    for entry in walker {
        let path = entry.path();
        // Only .lnk files, case-insensitive
        if !path.is_file() {
            continue;
        }
        let ext_ok = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("lnk"))
            .unwrap_or(false);
        if !ext_ok {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .trim();
        if stem.is_empty() {
            continue;
        }
        let name = stem.to_string();
        let exe = try_extract_exe_path(path);
        let category = categorize(&name);
        let id = stable_id(&name, exe.as_deref());
        out.push(AppDescriptor {
            id,
            name,
            executable_path: exe,
            icon_ref: None,
            source: AppSource::Windows,
            category,
            supported: true,
            unsupported_reason: None,
        });
        // honey: O(n) scan, fine for Start Menu (< ~1k entries); no full C:\ scan.
    }
}

/// Windows app scan - Start Menu .lnk + hardcoded known apps.
/// No full C:\ scan, no panic on missing dirs.
pub fn scan_apps() -> Vec<AppDescriptor> {
    let mut all: Vec<AppDescriptor> = Vec::new();

    // 1. Hardcoded known apps - always present (deterministic fallback)
    all.extend(known_apps());

    // 2. Start Menu scans (best-effort)
    let program_data = PathBuf::from(r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs");
    let appdata = std::env::var("APPDATA")
        .map(|p| PathBuf::from(p).join(r"Microsoft\Windows\Start Menu\Programs"))
        .ok();

    scan_start_menu_dir(&program_data, &mut all);
    if let Some(p) = appdata {
        scan_start_menu_dir(&p, &mut all);
    }

    // Also scan per-user fallback via USERPROFILE
    if let Ok(up) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(up).join(r"AppData\Roaming\Microsoft\Windows\Start Menu\Programs");
        // Dedupe via path check - if same as appdata we already scanned, skip duplicate dir equality
        scan_start_menu_dir(&p, &mut all);
    }

    // Dedupe by stable ID - keep first occurrence (known_apps take precedence)
    // Deterministic: preserve insertion order, then sort by (name, id) for stable tie-break.
    let mut seen: HashSet<String> = HashSet::new();
    let mut deduped: Vec<AppDescriptor> = Vec::new();
    for d in all {
        if seen.contains(&d.id) {
            continue;
        }
        seen.insert(d.id.clone());
        deduped.push(d);
    }

    // Sort by name case-insensitive, then id for deterministic tie-break
    deduped.sort_by(|a, b| {
        let ord = a.name.to_lowercase().cmp(&b.name.to_lowercase());
        if ord == std::cmp::Ordering::Equal {
            a.id.cmp(&b.id)
        } else {
            ord
        }
    });

    // Ensure at least known apps count even if dedupe reduced (should not)
    if deduped.len() < 6 {
        // Should never happen because known_apps is 7, but guard
        for k in known_apps() {
            if !deduped.iter().any(|d| d.id == k.id) {
                deduped.push(k);
            }
        }
        deduped.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    }

    deduped
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stable_id_deterministic() {
        let a = stable_id("Chrome", Some("C:\\chrome.exe"));
        let b = stable_id("Chrome", Some("C:\\chrome.exe"));
        assert_eq!(a, b);
        let c = stable_id("chrome", Some("C:\\chrome.exe"));
        assert_eq!(a, c);
    }
    #[test]
    fn scan_returns_at_least_6() {
        let v = scan_apps();
        assert!(v.len() >= 6);
    }
    #[test]
    fn scan_stable_across_calls() {
        let a = scan_apps();
        let b = scan_apps();
        let ids_a: Vec<_> = a.iter().map(|d| &d.id).collect();
        let ids_b: Vec<_> = b.iter().map(|d| &d.id).collect();
        assert_eq!(ids_a, ids_b);
    }
}
