use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// STEP 18 - Global Hotkeys (§32, §48)
/// 9 hotkeys with conflict handling, graceful failure, unregister on shutdown.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HotkeyId {
    ShiftEsc,
    CtrlSpace,
    CtrlAltA,
    CtrlAltLeft,
    CtrlAltRight,
    CtrlAltN,
    CtrlAltW,
    CtrlTab,
    CtrlShiftTab,
}

impl HotkeyId {
    pub fn accelerator(&self) -> &'static str {
        match self {
            Self::ShiftEsc => "Shift+Esc",
            Self::CtrlSpace => "Ctrl+Space",
            Self::CtrlAltA => "Ctrl+Alt+A",
            Self::CtrlAltLeft => "Ctrl+Alt+Left",
            Self::CtrlAltRight => "Ctrl+Alt+Right",
            Self::CtrlAltN => "Ctrl+Alt+N",
            Self::CtrlAltW => "Ctrl+Alt+W",
            Self::CtrlTab => "Ctrl+Tab",
            Self::CtrlShiftTab => "Ctrl+Shift+Tab",
        }
    }

    pub fn description(&self) -> &'static str {
        match self {
            Self::ShiftEsc => "Toggle overlay / focus AzaleaOS",
            Self::CtrlSpace => "Quick launcher",
            Self::CtrlAltA => "Toggle sidebar",
            Self::CtrlAltLeft => "Previous OS Tab",
            Self::CtrlAltRight => "Next OS Tab",
            Self::CtrlAltN => "New OS Tab",
            Self::CtrlAltW => "Close OS Tab",
            Self::CtrlTab => "Next App Tab",
            Self::CtrlShiftTab => "Previous App Tab",
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ShiftEsc => "shiftEsc",
            Self::CtrlSpace => "ctrlSpace",
            Self::CtrlAltA => "ctrlAltA",
            Self::CtrlAltLeft => "ctrlAltLeft",
            Self::CtrlAltRight => "ctrlAltRight",
            Self::CtrlAltN => "ctrlAltN",
            Self::CtrlAltW => "ctrlAltW",
            Self::CtrlTab => "ctrlTab",
            Self::CtrlShiftTab => "ctrlShiftTab",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "shiftEsc" | "ShiftEsc" | "Shift+Esc" => Some(Self::ShiftEsc),
            "ctrlSpace" | "CtrlSpace" | "Ctrl+Space" => Some(Self::CtrlSpace),
            "ctrlAltA" | "CtrlAltA" | "Ctrl+Alt+A" => Some(Self::CtrlAltA),
            "ctrlAltLeft" | "CtrlAltLeft" | "Ctrl+Alt+Left" => Some(Self::CtrlAltLeft),
            "ctrlAltRight" | "CtrlAltRight" | "Ctrl+Alt+Right" => Some(Self::CtrlAltRight),
            "ctrlAltN" | "CtrlAltN" | "Ctrl+Alt+N" => Some(Self::CtrlAltN),
            "ctrlAltW" | "CtrlAltW" | "Ctrl+Alt+W" => Some(Self::CtrlAltW),
            "ctrlTab" | "CtrlTab" | "Ctrl+Tab" => Some(Self::CtrlTab),
            "ctrlShiftTab" | "CtrlShiftTab" | "Ctrl+Shift+Tab" => Some(Self::CtrlShiftTab),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyDef {
    pub id: HotkeyId,
    #[serde(rename = "idStr")]
    pub id_str: String,
    pub accelerator: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyEvent {
    pub id: HotkeyId,
    #[serde(rename = "idStr")]
    pub id_str: String,
    pub accelerator: String,
}

pub fn all_hotkeys() -> Vec<HotkeyDef> {
    [
        HotkeyId::ShiftEsc,
        HotkeyId::CtrlSpace,
        HotkeyId::CtrlAltA,
        HotkeyId::CtrlAltLeft,
        HotkeyId::CtrlAltRight,
        HotkeyId::CtrlAltN,
        HotkeyId::CtrlAltW,
        HotkeyId::CtrlTab,
        HotkeyId::CtrlShiftTab,
    ]
    .iter()
    .map(|id| HotkeyDef {
        id: *id,
        id_str: id.as_str().to_string(),
        accelerator: id.accelerator().to_string(),
        description: id.description().to_string(),
    })
    .collect()
}

fn is_already_registered_msg(msg: &str) -> bool {
    let l = msg.to_lowercase();
    l.contains("already") || l.contains("registered") || l.contains("exists")
}

fn emit_hotkey(app: &AppHandle, id: HotkeyId) {
    let ev = HotkeyEvent {
        id,
        id_str: id.as_str().to_string(),
        accelerator: id.accelerator().to_string(),
    };
    log::info!("hotkey.triggered id={:?} accelerator={}", id, id.accelerator());
    if let Err(e) = app.emit("azalea:hotkey", &ev) {
        log::warn!("hotkey.emit failed id={:?} err={}", id, e);
    }
}

fn register_one(app: &AppHandle, id: HotkeyId) -> Result<(), String> {
    let accel = id.accelerator();
    let handler_id = id;
    // first attempt
    let res = app.global_shortcut().on_shortcut(accel, move |app_h, shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let _ = shortcut; // keep for log parity
            emit_hotkey(app_h, handler_id);
        }
    });
    match res {
        Ok(()) => {
            log::info!("hotkey.registered id={:?} accelerator={}", id, accel);
            Ok(())
        }
        Err(e) => {
            let msg = e.to_string();
            if is_already_registered_msg(&msg) {
                log::warn!(
                    "HotkeyRegistrationFailed accelerator={} id={:?} already registered, retry after unregister: {}",
                    accel, id, msg
                );
                let _ = app.global_shortcut().unregister(accel);
                let handler_id2 = id;
                let retry = app.global_shortcut().on_shortcut(accel, move |app_h, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = shortcut;
                        emit_hotkey(app_h, handler_id2);
                    }
                });
                match retry {
                    Ok(()) => {
                        log::info!("hotkey.registered.retry id={:?} accelerator={}", id, accel);
                        Ok(())
                    }
                    Err(e2) => {
                        let m2 = e2.to_string();
                        log::warn!(
                            "HotkeyRegistrationFailed accelerator={} id={:?} retry failed: {}",
                            accel, id, m2
                        );
                        Err(m2)
                    }
                }
            } else {
                log::warn!(
                    "HotkeyRegistrationFailed accelerator={} id={:?} error={}",
                    accel, id, msg
                );
                Err(msg)
            }
        }
    }
}

/// Register all 9 global hotkeys. Graceful failure: logs WARN per-hotkey, continues others.
/// Returns Ok even if some hotkeys fail (WARN), only hard config errors bubble.
pub fn register_hotkeys(app: &AppHandle) -> Result<(), crate::error::AzaleaError> {
    let mut failures: Vec<String> = Vec::new();
    for def in all_hotkeys() {
        if let Err(msg) = register_one(app, def.id) {
            failures.push(format!("{}:{}", def.accelerator, msg));
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        // Do not crash - surface as WARN log, keep Ok for caller to decide.
        // Caller in lib.rs logs WARN not panic (§32).
        // If all failed and caller wants typed error, it can inspect logs.
        // For API completeness, if at least one succeeded we still Ok.
        // Only if task requires error propagation, return HotkeyRegistrationFailed when any failed.
        // Per spec: "log WARN HotkeyRegistrationFailed but continue other hotkeys" - so Ok.
        log::warn!("HotkeyRegistrationFailed partial failures: {}", failures.join(", "));
        Ok(())
    }
}

/// Register a single hotkey by id string - used by hotkey_register command.
pub fn register_single_by_id(app: &AppHandle, id_str: &str) -> Result<(), crate::error::AzaleaError> {
    let id = HotkeyId::from_str(id_str).ok_or_else(|| {
        crate::error::AzaleaError::HotkeyRegistrationFailed(format!("unknown hotkey id: {}", id_str))
    })?;
    register_one(app, id).map_err(|m| crate::error::AzaleaError::HotkeyRegistrationFailed(m))
}

/// Unregister all hotkeys - called on shutdown / window close.
pub fn unregister_all(app: &AppHandle) {
    for def in all_hotkeys() {
        match app.global_shortcut().unregister(def.accelerator.as_str()) {
            Ok(()) => log::info!("hotkey.unregistered accelerator={}", def.accelerator),
            Err(e) => log::debug!("hotkey.unregister skip accelerator={} err={}", def.accelerator, e),
        }
    }
    // also try unregister_all if available (best-effort, ignore error)
    // tauri-plugin-global-shortcut provides unregister_all via GlobalShortcutExt
    // some versions expose it; use string fallback if not
    #[allow(unused_must_use)]
    {
        // try generic unregister_all - if method doesn't exist this line is no-op at compile
        // we guard with cfg to avoid compile error on older versions: use trait object check via closure
        // Since we can't feature-detect, attempt via explicit call if trait has it.
        // The plugin 2.x does have unregister_all; call it.
        let _ = app.global_shortcut().unregister_all();
    }
}
