use serde::{Deserialize, Serialize};

use crate::applications::descriptor::AppDescriptor;

/// Layered classifier output - §6 GAME / NON_GAME / UNKNOWN.
/// SCREAMING_SNAKE_CASE matches spec §6 exactly; frontend maps to string equality.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GameClass {
    Game,
    NonGame,
    Unknown,
}

impl std::fmt::Display for GameClass {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Game => "GAME",
            Self::NonGame => "NON_GAME",
            Self::Unknown => "UNKNOWN",
        };
        write!(f, "{}", s)
    }
}

// Known game / launcher substrings - §6 known game launcher/install patterns.
// Lowercased; searched against `name + exe_path` lowercased.
// Keep simple heuristic per task: lowercased name+exe_path contains any token → Game.
const GAME_TOKENS: &[&str] = &[
    "steam",
    "epic",
    "valorant",
    "minecraft",
    "fortnite",
    "overwatch",
    "league of legends",
    "league",
    "dota",
    "csgo",
    "counter-strike",
    "elden",
    "warcraft",
    "world of warcraft",
    "diablo",
    "starcraft",
    "destiny",
    "apex",
    "call of duty",
    "battle.net",
    "battlenet",
    "origin",
    "uplay",
    "ubisoft",
    "riot",
    "gog",
    "rockstar",
    "bethesda",
    "warzone",
    "pubg",
    "rocket league",
    "genshin",
    "elden ring",
    "hearthstone",
    "valorant", // duplicate intentional for spec list
    "game",     // catch-all for Start Menu\Programs\Games folder / exe containing game
];

// Known productive / non-game substrings - productivity + browser + dev + utility.
// If no game token matched but one of these matches → NonGame.
const NON_GAME_TOKENS: &[&str] = &[
    "code",
    "vscode",
    "visual studio",
    "chrome",
    "firefox",
    "edge",
    "brave",
    "opera",
    "terminal",
    "powershell",
    "cmd",
    "console",
    "windows terminal",
    "notepad",
    "sublime",
    "vim",
    "neovim",
    "intellij",
    "idea",
    "eclipse",
    "discord",
    "slack",
    "notion",
    "figma",
    "teams",
    "zoom",
    "outlook",
    "word",
    "excel",
    "powerpoint",
    "explorer",
    "file explorer",
    "files",
];

/// User override stub - §6 optional user override (highest priority).
/// None yet; placeholder for future config file `game_overrides.json`.
fn user_override(_app_id: &str) -> Option<GameClass> {
    None
}

/// Pure classifier by name + exe_path lowercased - testable, no I/O.
pub fn classify_by_name_and_path(name: &str, exe_path: Option<&str>) -> GameClass {
    let combined = match exe_path {
        Some(p) if !p.is_empty() => format!("{} {}", name, p).to_lowercase(),
        _ => name.to_lowercase(),
    };
    // honey: O(n*m) substring scan, fine for <~40 tokens and short strings
    for token in GAME_TOKENS {
        if combined.contains(token) {
            return GameClass::Game;
        }
    }
    for token in NON_GAME_TOKENS {
        if combined.contains(token) {
            return GameClass::NonGame;
        }
    }
    GameClass::Unknown
}

/// Layered classifier - §6
/// Order: user override → known game launcher patterns → heuristics (non-game) → Unknown.
pub fn classify(app: &AppDescriptor) -> GameClass {
    if let Some(ov) = user_override(&app.id) {
        log::info!("classifier.override app_id={} -> {}", app.id, ov);
        return ov;
    }
    let class = classify_by_name_and_path(&app.name, app.executable_path.as_deref());
    log::info!(
        "classifier.result app_id={} name={} exe={:?} -> {}",
        app.id,
        app.name,
        app.executable_path,
        class
    );
    class
}

/// Convenience: lookup by registry id then classify. Returns None if not found.
pub fn classify_by_id(app_id: &str) -> Option<GameClass> {
    crate::applications::registry::get_by_id(app_id).map(|d| classify(&d))
}

/// STEP 16 protection helpers - observe-only (no optimizer mutation here).
/// Game → protected (resource_manager protection), Unknown → conservative, NonGame → normal.
pub fn is_game_protected(class: GameClass) -> bool {
    matches!(class, GameClass::Game)
}

pub fn is_conservative(class: GameClass) -> bool {
    matches!(class, GameClass::Unknown)
}

pub fn allow_aggressive(class: GameClass) -> bool {
    matches!(class, GameClass::NonGame)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::applications::descriptor::{AppCategory, AppDescriptor, AppSource};

    fn desc(name: &str, exe: Option<&str>) -> AppDescriptor {
        AppDescriptor {
            id: format!("test-{}", name.to_lowercase().replace(' ', "-")),
            name: name.to_string(),
            executable_path: exe.map(|s| s.to_string()),
            icon_ref: None,
            source: AppSource::Windows,
            category: AppCategory::Unknown,
            supported: true,
            unsupported_reason: None,
        }
    }

    #[test]
    fn valorant_is_game() {
        let d = desc("Valorant", Some("C:\\Riot Games\\Valorant\\VALORANT.exe"));
        assert_eq!(classify(&d), GameClass::Game);
    }

    #[test]
    fn minecraft_is_game() {
        let d = desc("Minecraft", Some("C:\\Program Files\\Minecraft\\minecraft.exe"));
        assert_eq!(classify(&d), GameClass::Game);
    }

    #[test]
    fn steam_is_game() {
        let d = desc("Steam", Some("C:\\Program Files (x86)\\Steam\\steam.exe"));
        assert_eq!(classify(&d), GameClass::Game);
    }

    #[test]
    fn epic_is_game() {
        let d = desc("Epic Games Launcher", Some("C:\\Program Files\\Epic Games\\Launcher\\EpicGamesLauncher.exe"));
        assert_eq!(classify(&d), GameClass::Game);
    }

    #[test]
    fn fortnite_is_game() {
        let d = desc("Fortnite", Some("C:\\Epic Games\\Fortnite\\Fortnite.exe"));
        assert_eq!(classify(&d), GameClass::Game);
    }

    #[test]
    fn elden_ring_is_game() {
        let d = desc("ELDEN RING", Some("C:\\Games\\ELDEN RING\\eldenring.exe"));
        assert_eq!(classify(&d), GameClass::Game);
    }

    #[test]
    fn overwatch_is_game() {
        let d = desc("Overwatch", Some("C:\\Games\\Overwatch\\Overwatch.exe"));
        assert_eq!(classify(&d), GameClass::Game);
    }

    #[test]
    fn csgo_is_game() {
        let d = desc("CSGO", Some("C:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\csgo.exe"));
        assert_eq!(classify(&d), GameClass::Game);
    }

    #[test]
    fn unknown_xyz_is_unknown() {
        let d = desc("MyCustomAppXYZ123", Some("C:\\Apps\\xyz123\\custom.exe"));
        assert_eq!(classify(&d), GameClass::Unknown);
    }

    #[test]
    fn unknown_no_exe_is_unknown() {
        let d = desc("SomeRandomToolABC", None);
        assert_eq!(classify(&d), GameClass::Unknown);
    }

    #[test]
    fn chrome_is_nongame() {
        let d = desc("Chrome", Some("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"));
        assert_eq!(classify(&d), GameClass::NonGame);
    }

    #[test]
    fn vscode_is_nongame() {
        let d = desc("VS Code", Some("C:\\Program Files\\Microsoft VS Code\\Code.exe"));
        assert_eq!(classify(&d), GameClass::NonGame);
    }

    #[test]
    fn terminal_is_nongame() {
        let d = desc("Terminal", Some("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"));
        assert_eq!(classify(&d), GameClass::NonGame);
    }

    #[test]
    fn notepad_is_nongame() {
        let d = desc("Notepad", Some("C:\\Windows\\System32\\notepad.exe"));
        assert_eq!(classify(&d), GameClass::NonGame);
    }

    #[test]
    fn discord_is_nongame() {
        let d = desc("Discord", Some("C:\\Users\\Default\\AppData\\Local\\Discord\\Update.exe"));
        assert_eq!(classify(&d), GameClass::NonGame);
    }

    #[test]
    fn game_token_priority_over_nongame() {
        // name contains both "game" and "code" - game should win (checked first)
        let d = desc("Game Code Studio", Some("C:\\Games\\gamecode.exe"));
        assert_eq!(classify(&d), GameClass::Game);
    }

    #[test]
    fn serialize_screaming_snake() {
        assert_eq!(serde_json::to_string(&GameClass::Game).unwrap(), "\"GAME\"");
        assert_eq!(serde_json::to_string(&GameClass::NonGame).unwrap(), "\"NON_GAME\"");
        assert_eq!(serde_json::to_string(&GameClass::Unknown).unwrap(), "\"UNKNOWN\"");
    }

    #[test]
    fn display_matches_serialize() {
        assert_eq!(GameClass::Game.to_string(), "GAME");
        assert_eq!(GameClass::NonGame.to_string(), "NON_GAME");
        assert_eq!(GameClass::Unknown.to_string(), "UNKNOWN");
    }

    #[test]
    fn protection_helpers() {
        assert!(is_game_protected(GameClass::Game));
        assert!(!is_game_protected(GameClass::Unknown));
        assert!(!is_game_protected(GameClass::NonGame));

        assert!(is_conservative(GameClass::Unknown));
        assert!(!is_conservative(GameClass::Game));
        assert!(!is_conservative(GameClass::NonGame));

        assert!(allow_aggressive(GameClass::NonGame));
        assert!(!allow_aggressive(GameClass::Game));
        assert!(!allow_aggressive(GameClass::Unknown));
    }

    #[test]
    fn case_insensitive() {
        let d = desc("VALORANT", Some("C:\\RIOT\\VALORANT.EXE"));
        assert_eq!(classify(&d), GameClass::Game);
        let d2 = desc("CHROME", Some("C:\\CHROME.EXE"));
        assert_eq!(classify(&d2), GameClass::NonGame);
    }
}
