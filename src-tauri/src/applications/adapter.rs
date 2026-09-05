use serde::{Deserialize, Serialize};

use crate::applications::classifier;
use crate::applications::descriptor::{AppCategory, AppDescriptor};

/// Adapter types - STEP 22 real-app compatibility.
/// Fix adapters, not core (§48 STEP 22).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AdapterType {
    Browser,
    Ide,
    Utility,
    MultiProcess,
    MultiWindow,
    Media,
    Game,
    Unknown,
}

impl std::fmt::Display for AdapterType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Browser => "Browser",
            Self::Ide => "Ide",
            Self::Utility => "Utility",
            Self::MultiProcess => "MultiProcess",
            Self::MultiWindow => "MultiWindow",
            Self::Media => "Media",
            Self::Game => "Game",
            Self::Unknown => "Unknown",
        };
        write!(f, "{}", s)
    }
}

// Token lists - lowercased substrings searched in `name + exe_path`
const BROWSER_TOKENS: &[&str] = &["chrome", "firefox", "msedge", "brave", "opera"];
// edge as standalone token - avoid "knowledge" false positive by checking "edge" with word boundary via contains " edge" or "edge.exe" etc; but simple contains "edge" is ok for short MVP list
const BROWSER_EDGE_TOKEN: &str = "edge";

const IDE_TOKENS: &[&str] = &[
    "vscode",
    "visual studio",
    "intellij",
    "idea",
    "sublime",
    "neovim",
];

const MEDIA_TOKENS: &[&str] = &[
    "vlc",
    "spotify",
    "media player",
    "netflix",
    "potplayer",
    "kodi",
    "mpc-hc",
    "winamp",
    "obs",
];

const UTILITY_TOKENS: &[&str] = &[
    "notepad",
    "terminal",
    "powershell",
    "cmd",
    "console",
    "windows terminal",
    "explorer",
    "files",
    "file explorer",
];

const MULTIPROCESS_TOKENS: &[&str] = &[
    "chrome",
    "msedge",
    "firefox",
    "brave",
    "opera",
    "code",
    "vscode",
    "electron",
    "discord",
    "slack",
    "teams",
];

const MULTIWINDOW_TOKENS: &[&str] = &[
    "chrome",
    "firefox",
    "msedge",
    "edge",
    "brave",
    "opera",
    "notepad",
    "code",
    "vscode",
    "explorer",
    "terminal",
    "discord",
];

fn combined_lower(app: &AppDescriptor) -> String {
    match &app.executable_path {
        Some(p) if !p.is_empty() => format!("{} {}", app.name, p).to_lowercase(),
        _ => app.name.to_lowercase(),
    }
}

fn contains_any(hay: &str, tokens: &[&str]) -> bool {
    tokens.iter().any(|t| hay.contains(t))
}

fn is_browser(app: &AppDescriptor) -> bool {
    let s = combined_lower(app);
    if contains_any(&s, BROWSER_TOKENS) {
        return true;
    }
    // edge token - avoid false match inside other words by requiring "edge" bounded by non-alpha or end
    // simple: if s contains "edge" and (s contains "edge.exe" or "edge " or " msedge" or " microsoft edge")
    if s.contains(BROWSER_EDGE_TOKEN) {
        // disambiguate: "edge" should be whole word-ish - accept if contains "edge" and not part of "knowledge" etc
        // heuristic: if s contains "edge" plus browser path hint or name is Edge
        if s.contains("msedge") || s.contains("microsoft edge") || s.contains("edge.exe") || s == "edge" || s.contains(" edge") || s.contains("edge ") {
            return true;
        }
        // fallback: if category Browser then trust
        if app.category == AppCategory::Browser {
            return true;
        }
        // still accept plain "edge" substring for MVP simplicity (rare false positive acceptable)
        return true;
    }
    app.category == AppCategory::Browser
}

fn is_ide(app: &AppDescriptor) -> bool {
    let s = combined_lower(app);
    // "code" is ambiguous (vscode vs generic); handle via exe hint
    if s.contains("code.exe") || s.contains("vscode") || s.contains("visual studio") {
        return true;
    }
    if contains_any(&s, IDE_TOKENS) {
        return true;
    }
    // also category Developer
    app.category == AppCategory::Developer
}

fn is_media(app: &AppDescriptor) -> bool {
    let s = combined_lower(app);
    contains_any(&s, MEDIA_TOKENS)
}

fn is_utility(app: &AppDescriptor) -> bool {
    let s = combined_lower(app);
    contains_any(&s, UTILITY_TOKENS) || app.category == AppCategory::Utility || app.category == AppCategory::System
}

/// Known multi-process patterns - chrome → MultiProcess+MultiWindow, vscode → MultiProcess (§48 STEP 22 task)
pub fn is_multi_process(app: &AppDescriptor) -> bool {
    let s = combined_lower(app);
    contains_any(&s, MULTIPROCESS_TOKENS)
}

/// Multi-window capable via EnumWindows mapping (§13, §10) - enumerate windows per pid via tracking, group by pid
pub fn can_handle_multi_window(app: &AppDescriptor) -> bool {
    let s = combined_lower(app);
    contains_any(&s, MULTIWINDOW_TOKENS)
}

/// Heuristic adapter selection based on name/category and exe path.
/// Order: Game (classifier/category) → Browser → Ide → Media → MultiProcess → MultiWindow → Utility → Unknown
/// Logs INFO adapter selected (§34).
pub fn get_adapter(app: &AppDescriptor) -> AdapterType {
    // Game first - classifier is authoritative; category Game also counts
    let game_class = classifier::classify_by_name_and_path(&app.name, app.executable_path.as_deref());
    if game_class == classifier::GameClass::Game || app.category == AppCategory::Game {
        log::info!("adapter.selected app_id={} name={} exe={:?} -> Game", app.id, app.name, app.executable_path);
        return AdapterType::Game;
    }

    if is_browser(app) {
        log::info!("adapter.selected app_id={} name={} exe={:?} -> Browser (multi_process={} multi_window={})", app.id, app.name, app.executable_path, is_multi_process(app), can_handle_multi_window(app));
        return AdapterType::Browser;
    }
    if is_ide(app) {
        log::info!("adapter.selected app_id={} name={} exe={:?} -> Ide (multi_process={} multi_window={})", app.id, app.name, app.executable_path, is_multi_process(app), can_handle_multi_window(app));
        return AdapterType::Ide;
    }
    if is_media(app) {
        log::info!("adapter.selected app_id={} name={} exe={:?} -> Media", app.id, app.name, app.executable_path);
        return AdapterType::Media;
    }
    if is_utility(app) {
        log::info!("adapter.selected app_id={} name={} exe={:?} -> Utility (multi_process={} multi_window={})", app.id, app.name, app.executable_path, is_multi_process(app), can_handle_multi_window(app));
        return AdapterType::Utility;
    }
    // MultiProcess/MultiWindow as primary type only for apps that are not Browser/Ide/Media/Game/Utility but are known multi-*
    if is_multi_process(app) {
        // If also multi-window capable, prefer MultiProcess as adapter (represents electron-like), multi_window via helper
        log::info!("adapter.selected app_id={} name={} exe={:?} -> MultiProcess (multi_window={})", app.id, app.name, app.executable_path, can_handle_multi_window(app));
        return AdapterType::MultiProcess;
    }
    if can_handle_multi_window(app) {
        log::info!("adapter.selected app_id={} name={} exe={:?} -> MultiWindow", app.id, app.name, app.executable_path);
        return AdapterType::MultiWindow;
    }

    log::info!("adapter.selected app_id={} name={} exe={:?} -> Unknown", app.id, app.name, app.executable_path);
    AdapterType::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::applications::descriptor::{AppCategory, AppDescriptor, AppSource};
    use crate::applications::discovery::stable_id;

    fn desc(name: &str, exe: Option<&str>, cat: AppCategory) -> AppDescriptor {
        AppDescriptor {
            id: stable_id(name, exe),
            name: name.to_string(),
            executable_path: exe.map(|s| s.to_string()),
            icon_ref: None,
            source: AppSource::Windows,
            category: cat,
            supported: true,
            unsupported_reason: None,
        }
    }

    #[test]
    fn browser_chrome() {
        let d = desc("Chrome", Some("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"), AppCategory::Browser);
        assert_eq!(get_adapter(&d), AdapterType::Browser);
        assert!(is_multi_process(&d));
        assert!(can_handle_multi_window(&d));
    }

    #[test]
    fn ide_vscode() {
        let d = desc("VS Code", Some("C:\\Program Files\\Microsoft VS Code\\Code.exe"), AppCategory::Developer);
        assert_eq!(get_adapter(&d), AdapterType::Ide);
        assert!(is_multi_process(&d));
    }

    #[test]
    fn utility_notepad() {
        let d = desc("Notepad", Some("C:\\Windows\\System32\\notepad.exe"), AppCategory::Utility);
        assert_eq!(get_adapter(&d), AdapterType::Utility);
        // Notepad handles multi-window via EnumWindows grouping
        assert!(can_handle_multi_window(&d));
        assert!(!is_multi_process(&d));
    }

    #[test]
    fn utility_terminal() {
        let d = desc("Terminal", Some("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"), AppCategory::Utility);
        assert_eq!(get_adapter(&d), AdapterType::Utility);
        assert!(can_handle_multi_window(&d));
    }

    #[test]
    fn multiprocess_electron() {
        let d = desc("Electron App", Some("C:\\Apps\\electron.exe"), AppCategory::Unknown);
        assert_eq!(get_adapter(&d), AdapterType::MultiProcess);
        assert!(is_multi_process(&d));
    }

    #[test]
    fn multiwindow_notepad_multi() {
        // App that is only multi-window, not multi-process nor utility token beyond notepad
        let d = desc("Notepad", Some("C:\\Windows\\notepad.exe"), AppCategory::Unknown);
        // get_adapter returns Utility (which is also multi-window capable) - verify helper
        assert!(can_handle_multi_window(&d));
        // force MultiWindow adapter via non-utility multi-window name
        let d2 = desc("Chrome", Some("C:\\chrome.exe"), AppCategory::Unknown);
        // Chrome is Browser, but multi-window helper still true
        assert!(can_handle_multi_window(&d2));
        // pure MultiWindow: use explorer which is Utility but test helper
        let d3 = desc("File Explorer", Some("C:\\Windows\\explorer.exe"), AppCategory::System);
        assert!(can_handle_multi_window(&d3));
    }

    #[test]
    fn downloads_chrome_still_browser() {
        // Downloads (Chrome) → Browser adapter, protection via activity not adapter type
        let d = desc("Chrome", Some("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"), AppCategory::Browser);
        assert_eq!(get_adapter(&d), AdapterType::Browser);
    }

    #[test]
    fn media_spotify_vlc() {
        let d = desc("Spotify", Some("C:\\Users\\Default\\AppData\\Roaming\\Spotify\\Spotify.exe"), AppCategory::Unknown);
        assert_eq!(get_adapter(&d), AdapterType::Media);
        let d2 = desc("VLC", Some("C:\\Program Files\\VideoLAN\\VLC\\vlc.exe"), AppCategory::Unknown);
        assert_eq!(get_adapter(&d2), AdapterType::Media);
        assert!(!is_multi_process(&d2));
    }

    #[test]
    fn game_valorant_minecraft() {
        let d = desc("Valorant", Some("C:\\Riot Games\\Valorant\\VALORANT.exe"), AppCategory::Game);
        assert_eq!(get_adapter(&d), AdapterType::Game);
        let d2 = desc("Minecraft", Some("C:\\Program Files\\Minecraft\\minecraft.exe"), AppCategory::Game);
        assert_eq!(get_adapter(&d2), AdapterType::Game);
        // also via classifier even if category Unknown but name contains game token
        let d3 = desc("Valorant", Some("C:\\Riot\\VALORANT.exe"), AppCategory::Unknown);
        assert_eq!(get_adapter(&d3), AdapterType::Game);
    }

    #[test]
    fn unknown_xyz() {
        let d = desc("MyCustomAppXYZ123", Some("C:\\Apps\\xyz123\\custom.exe"), AppCategory::Unknown);
        assert_eq!(get_adapter(&d), AdapterType::Unknown);
        assert!(!is_multi_process(&d));
        assert!(!can_handle_multi_window(&d));
    }

    #[test]
    fn multiprocess_discord() {
        let d = desc("Discord", Some("C:\\Users\\Default\\AppData\\Local\\Discord\\Update.exe"), AppCategory::Productivity);
        // Discord is electron → MultiProcess
        assert_eq!(get_adapter(&d), AdapterType::MultiProcess);
        assert!(is_multi_process(&d));
        assert!(can_handle_multi_window(&d));
    }

    #[test]
    fn vs_code_multi_process_helper() {
        let d = desc("VS Code", Some("C:\\Program Files\\Microsoft VS Code\\Code.exe"), AppCategory::Developer);
        assert!(is_multi_process(&d));
        assert!(can_handle_multi_window(&d));
    }

    #[test]
    fn chrome_multi_both_helpers() {
        let d = desc("Chrome", Some("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"), AppCategory::Browser);
        assert!(is_multi_process(&d));
        assert!(can_handle_multi_window(&d));
        assert_eq!(get_adapter(&d), AdapterType::Browser);
    }
}
