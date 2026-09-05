use crate::applications::classifier::GameClass;

/// Protection policy mapping for STEP 16 - observe-only, no optimizer mutation.
/// Spec §6 + §23: Game → protected (no aggressive), Unknown → conservative, NonGame → normal.
///
/// This module is the integration point between `applications::classifier` and
/// `resource_manager::optimizer` safety. For STEP 16 it stands alone (observe);
/// optimizer safety already checks `activity::is_game` via registry category,
/// but future steps can consult this classifier source as well.

/// True iff classifier says GAME → protected (resource_manager protection per §23).
pub fn is_game_protected(class: GameClass) -> bool {
    matches!(class, GameClass::Game)
}

/// True iff UNKNOWN → conservative (allow launch, but not aggressive optimize).
pub fn is_conservative(class: GameClass) -> bool {
    matches!(class, GameClass::Unknown)
}

/// True iff NON_GAME → normal (aggressive allowed under pressure if other guards pass).
pub fn is_normal(class: GameClass) -> bool {
    matches!(class, GameClass::NonGame)
}

/// Whether aggressive optimization should be blocked for this class.
/// Game + Unknown block aggressive; only NonGame allows it.
pub fn should_block_aggressive(class: GameClass) -> bool {
    !matches!(class, GameClass::NonGame)
}

/// Whether aggressive is allowed (inverse of should_block).
pub fn allow_aggressive(class: GameClass) -> bool {
    matches!(class, GameClass::NonGame)
}

/// Human-readable protection label per acceptance criteria.
pub fn protection_label(class: GameClass) -> &'static str {
    match class {
        GameClass::Game => "protected",
        GameClass::Unknown => "conservative",
        GameClass::NonGame => "normal",
    }
}

/// Classify then map - helper for callers that have a descriptor.
pub fn protection_for_descriptor(app: &crate::applications::descriptor::AppDescriptor) -> (GameClass, &'static str, bool) {
    let class = crate::applications::classifier::classify(app);
    let label = protection_label(class);
    let block = should_block_aggressive(class);
    (class, label, block)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::applications::classifier::GameClass;

    #[test]
    fn game_is_protected() {
        assert!(is_game_protected(GameClass::Game));
        assert!(!is_game_protected(GameClass::Unknown));
        assert!(!is_game_protected(GameClass::NonGame));
        assert_eq!(protection_label(GameClass::Game), "protected");
        assert!(should_block_aggressive(GameClass::Game));
    }

    #[test]
    fn unknown_is_conservative() {
        assert!(is_conservative(GameClass::Unknown));
        assert!(!is_conservative(GameClass::Game));
        assert_eq!(protection_label(GameClass::Unknown), "conservative");
        assert!(should_block_aggressive(GameClass::Unknown));
        assert!(!allow_aggressive(GameClass::Unknown));
    }

    #[test]
    fn nongame_is_normal() {
        assert!(is_normal(GameClass::NonGame));
        assert_eq!(protection_label(GameClass::NonGame), "normal");
        assert!(!should_block_aggressive(GameClass::NonGame));
        assert!(allow_aggressive(GameClass::NonGame));
    }

    #[test]
    fn protection_for_descriptor_maps_correctly() {
        use crate::applications::descriptor::{AppCategory, AppDescriptor, AppSource};
        let game_desc = AppDescriptor {
            id: "g".to_string(),
            name: "Valorant".to_string(),
            executable_path: Some("C:\\Valorant\\valorant.exe".to_string()),
            icon_ref: None,
            source: AppSource::Windows,
            category: AppCategory::Game,
            supported: true,
            unsupported_reason: None,
        };
        let (class, label, block) = protection_for_descriptor(&game_desc);
        assert_eq!(class, GameClass::Game);
        assert_eq!(label, "protected");
        assert!(block);

        let chrome_desc = AppDescriptor {
            id: "c".to_string(),
            name: "Chrome".to_string(),
            executable_path: Some("C:\\chrome.exe".to_string()),
            icon_ref: None,
            source: AppSource::Windows,
            category: AppCategory::Browser,
            supported: true,
            unsupported_reason: None,
        };
        let (class2, label2, block2) = protection_for_descriptor(&chrome_desc);
        assert_eq!(class2, GameClass::NonGame);
        assert_eq!(label2, "normal");
        assert!(!block2);
    }
}
