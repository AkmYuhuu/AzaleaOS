pub mod app_core;
pub mod applications;
pub mod config;
pub mod diagnostics;
pub mod error;
pub mod filesystem;
pub mod hotkeys;
pub mod processes;
pub mod resource_manager;
pub mod resources;
pub mod windows;
pub mod workspace;

use app_core::capabilities::{Capabilities, CapabilitiesDTO, FULL_CAPABILITIES};
use app_core::edition::Edition;
use app_core::state::AppState;
use config::schema::AppConfig;
use error::AzaleaError;
use tauri::{Emitter, Manager};
// FORBIDDEN: no --lite CLI flag, no AZALEA_EDITION env var, no std::env::args lite inspection - Full is compile-time hardcoded.

// STEP 20 IPC Hardening Audit (§48, §27, §28, §36, §43):
// - Commands: narrow, auditable allowlist - no execute_anything/run_shell, no generic shell/fs wildcard.
//   See invoke_handler list (~73 commands) and capabilities/default.json (explicit allowlist, no "*").
// - DTOs: internal models mapped to owned DTOs with #[serde(rename_all="camelCase")]; no internal leak,
//   no raw stack trace to UI - errors are AzaleaError codes + user-safe messages (§36).
// - Validation: filesystem paths reject empty/\0; workspace names non-empty + reject \0; appId non-empty
//   + existence check; hotkey id enum validated; window bounds validated; etc. See individual commands.
// - Throttling: resource_snapshot/pressure are on-demand only (§33 500-1000ms UI cadence, frontend 750ms throttle);
//   no background busy-loop in backend sampler. Pressure/pressure_with_input compute is O(1).
// - Event volume: lifecycle/activity are request/response, not pushed stream; hotkey/launcher emits are
//   coalesced one-shot per user action. No jitter loop flooding; sampler has no autonomous emit.
// - Error contracts: every fallible command returns Result<T,String> via AzaleaError::...to_string() (typed code prefix).

#[tauri::command]
fn health() -> String {
    "ok: AzaleaOS Full - foundation".to_string()
}

#[tauri::command]
fn get_edition() -> String {
    Edition::current().to_string()
}

#[tauri::command]
fn get_capabilities() -> CapabilitiesDTO {
    // STEP 21: authority is FULL_CAPABILITIES constant (hardcoded Full, no dynamic/env/lite path).
    // Returns CapabilitiesDTO {maxOsTabs:10, maxAppsPerOsTab:10, resourcePolicy:"Full/adaptive",
    // advancedAutomation:true, advancedCustomization:true, edition:"full"}.
    let _assert_full: Capabilities = FULL_CAPABILITIES;
    let dto: CapabilitiesDTO = _assert_full.into();
    debug_assert_eq!(dto.max_os_tabs, 10);
    debug_assert_eq!(dto.max_apps_per_os_tab, 10);
    dto
}

#[tauri::command]
fn get_config_dir(state: tauri::State<'_, AppState>) -> String {
    state.config_dir.display().to_string()
}

#[tauri::command]
fn get_log_dir(state: tauri::State<'_, AppState>) -> String {
    state.log_dir.display().to_string()
}

#[tauri::command]
fn config_get(state: tauri::State<'_, AppState>) -> Result<AppConfig, String> {
    config::repository::read_config(&state.config_dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn config_set(state: tauri::State<'_, AppState>, cfg: AppConfig) -> Result<AppConfig, String> {
    if cfg.edition != "full" {
        return Err(crate::error::AzaleaError::UnsupportedEdition(format!(
            "edition must be full, got {}",
            cfg.edition
        ))
        .to_string());
    }
    // STEP 20: validate full config contract (theme/sidebarMode/resourcePolicy) before persist (§29, §36)
    cfg.validate().map_err(|e| e.to_string())?;
    config::repository::write_config(&state.config_dir, &cfg).map_err(|e| e.to_string())?;
    Ok(cfg)
}

#[tauri::command]
fn app_list() -> Vec<applications::descriptor::AppDescriptor> {
    log::info!("app.list invoked");
    applications::discovery::scan_apps()
}

#[allow(non_snake_case)]
#[tauri::command]
fn app_get_state(
    app_id: Option<String>,
    appId: Option<String>,
) -> Option<applications::descriptor::AppDescriptor> {
    let id = appId.or(app_id)?;
    log::info!("app.get_state id={}", id);
    applications::registry::get_by_id(&id)
}

// ---- STEP 4: Process Monitoring IPC (§8, §9.3) ----

#[tauri::command]
fn process_list() -> Vec<processes::identity::ProcessIdentity> {
    log::info!("process.list invoked");
    processes::discovery::list_processes()
}

#[tauri::command]
fn process_get_metrics(pid: u32) -> Option<processes::metrics::ProcessMetrics> {
    log::info!("process.get_metrics pid={}", pid);
    processes::metrics::sample_one(pid)
}

#[tauri::command]
fn process_is_alive(pid: u32) -> bool {
    processes::lifecycle::is_alive(pid)
}

// ---- STEP 9: Window Hosting Prototype IPC (§11, §48) ----

#[tauri::command]
fn window_can_host(hwnd: u64) -> bool {
    windows::host::can_host_window(hwnd)
}

#[allow(non_snake_case)]
#[tauri::command]
fn window_try_host(hwnd: u64, parentHwnd: Option<u64>) -> windows::host::HostingResult {
    // also accept snake_case parent_hwnd via manual alias - Tauri camelCase from frontend is parentHwnd
    windows::host::try_host_window(hwnd, parentHwnd)
}

#[tauri::command]
fn window_resize_hosted(hwnd: u64, width: i32, height: i32) -> Result<(), String> {
    windows::host::resize_hosted(hwnd, width, height)
}

#[tauri::command]
fn window_focus_hosted(hwnd: u64) -> Result<(), String> {
    windows::host::focus_hosted(hwnd)
}

#[tauri::command]
fn window_close_hosted(hwnd: u64) -> Result<(), String> {
    windows::host::close_hosted(hwnd)
}

// ---- STEP 5: Window Enumeration + Tracking IPC (§10, §10.1) ----

#[tauri::command]
fn window_list() -> Vec<windows::identity::WindowIdentity> {
    log::info!("window.list invoked");
    windows::tracking::track_windows()
}

#[tauri::command]
fn window_get_foreground() -> Option<u64> {
    windows::focus::get_foreground_window()
}

#[tauri::command]
fn window_get_bounds(hwnd: u64) -> Option<windows::bounds::WindowBounds> {
    windows::management::get_bounds(hwnd)
}

#[tauri::command]
fn window_focus(hwnd: u64) -> Result<(), String> {
    windows::management::focus_window(hwnd).map_err(|e| e.to_string())
}

#[tauri::command]
fn window_minimize(hwnd: u64) -> Result<(), String> {
    windows::management::minimize_window(hwnd).map_err(|e| e.to_string())
}

#[tauri::command]
fn window_restore(hwnd: u64) -> Result<(), String> {
    windows::management::restore_window(hwnd).map_err(|e| e.to_string())
}

#[tauri::command]
fn window_set_bounds(hwnd: u64, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
    windows::management::set_bounds(hwnd, x, y, width, height).map_err(|e| e.to_string())
}

#[tauri::command]
fn window_is_visible(hwnd: u64) -> bool {
    windows::management::is_visible(hwnd)
}

// ---- STEP 6: Application Launcher IPC (§7, §36) ----

#[allow(non_snake_case)]
#[tauri::command]
fn app_launch(
    app: tauri::AppHandle,
    app_id: Option<String>,
    appId: Option<String>,
) -> Result<applications::launcher::LaunchResult, String> {
    let id = appId
        .or(app_id)
        .ok_or_else(|| AzaleaError::InvalidPath("missing appId".to_string()).to_string())?;
    // STEP 20 hardening: reject empty/\0/overlong appId before registry lookup (§43, §36)
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err(AzaleaError::InvalidPath("appId must not be empty".into()).to_string());
    }
    if trimmed.contains('\0') {
        return Err(AzaleaError::InvalidPath("appId contains null byte".into()).to_string());
    }
    if trimmed.len() > 256 {
        return Err(AzaleaError::InvalidPath("appId too long".into()).to_string());
    }
    let id = trimmed.to_string();
    log::info!("app.launch appId={}", id);
    let result = applications::launcher::launch_app(id).map_err(|e| e.to_string())?;
    applications::launcher::emit_launch_events(Some(&app), &result);
    Ok(result)
}

// ---- STEP 7: Workspace Backend IPC (§12, §13, §41) ----

#[tauri::command]
fn workspace_list(state: tauri::State<'_, workspace::WorkspaceManager>) -> Vec<workspace::Workspace> {
    state.get_workspaces()
}

#[tauri::command]
fn workspace_get(
    state: tauri::State<'_, workspace::WorkspaceManager>,
    id: String,
) -> Option<workspace::Workspace> {
    state.get_workspace(&id)
}

#[tauri::command]
fn workspace_active(state: tauri::State<'_, workspace::WorkspaceManager>) -> Option<String> {
    state.get_active_id()
}

#[tauri::command]
fn workspace_create(
    state: tauri::State<'_, workspace::WorkspaceManager>,
    name: String,
) -> Result<workspace::Workspace, String> {
    state.create_workspace(name).map_err(|e| e.to_string())
}

#[tauri::command]
fn workspace_rename(
    state: tauri::State<'_, workspace::WorkspaceManager>,
    id: String,
    name: String,
) -> Result<workspace::Workspace, String> {
    state.rename_workspace(&id, name).map_err(|e| e.to_string())
}

#[tauri::command]
fn workspace_close(
    state: tauri::State<'_, workspace::WorkspaceManager>,
    id: String,
) -> Result<(), String> {
    state.close_workspace(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn workspace_switch(
    state: tauri::State<'_, workspace::WorkspaceManager>,
    id: String,
) -> Result<(), String> {
    state.switch_workspace(&id).map_err(|e| e.to_string())
}

#[allow(non_snake_case)]
#[tauri::command]
fn workspace_add_app(
    state: tauri::State<'_, workspace::WorkspaceManager>,
    workspace_id: Option<String>,
    workspaceId: Option<String>,
    app_id: Option<String>,
    appId: Option<String>,
) -> Result<workspace::AppTab, String> {
    let ws_id = workspaceId
        .or(workspace_id)
        .ok_or_else(|| AzaleaError::InvalidPath("missing workspaceId".to_string()).to_string())?;
    let a_id = appId
        .or(app_id)
        .ok_or_else(|| AzaleaError::InvalidPath("missing appId".to_string()).to_string())?;
    state.add_app_to_workspace(&ws_id, a_id).map_err(|e| e.to_string())
}

#[allow(non_snake_case)]
#[tauri::command]
fn workspace_remove_app(
    state: tauri::State<'_, workspace::WorkspaceManager>,
    workspace_id: Option<String>,
    workspaceId: Option<String>,
    app_tab_id: Option<String>,
    appTabId: Option<String>,
) -> Result<(), String> {
    let ws_id = workspaceId
        .or(workspace_id)
        .ok_or_else(|| AzaleaError::InvalidPath("missing workspaceId".to_string()).to_string())?;
    let tab_id = appTabId
        .or(app_tab_id)
        .ok_or_else(|| AzaleaError::InvalidPath("missing appTabId".to_string()).to_string())?;
    state.remove_app_from_workspace(&ws_id, &tab_id).map_err(|e| e.to_string())
}

#[allow(non_snake_case)]
#[tauri::command]
fn workspace_get_apps(
    state: tauri::State<'_, workspace::WorkspaceManager>,
    workspace_id: Option<String>,
    workspaceId: Option<String>,
) -> Vec<workspace::AppTab> {
    let ws_id = workspaceId.or(workspace_id).unwrap_or_default();
    if ws_id.is_empty() {
        return vec![];
    }
    state.get_apps_for_workspace(&ws_id)
}

#[tauri::command]
fn workspace_list_all_app_tabs(
    state: tauri::State<'_, workspace::WorkspaceManager>,
) -> Vec<workspace::AppTab> {
    state.list_all_app_tabs()
}

// ---- STEP 10: Resource Monitor IPC (§14, §14.1, §14.2, §33) ----
// STEP 20 throttling note: on-demand only; frontend throttled 750ms (500-1000ms §33 cadence),
// no backend busy loop. Sampler is O(1) per call; repeated tight polls are coalesced by UI.
// No per-render invoke; event volume bounded.

#[tauri::command]
fn resource_snapshot() -> resources::sampler::SystemResourceSnapshot {
    log::info!("resource.snapshot invoked");
    resources::sampler::snapshot_system()
}

#[tauri::command]
fn resource_get_process(pid: u32) -> Option<resources::sampler::ProcessResourceSnapshot> {
    log::info!("resource.get_process pid={}", pid);
    resources::sampler::snapshot_process(pid)
}

// ---- STEP 11: Resource Pressure Engine IPC (§15) - observe-only ----

#[tauri::command]
fn resource_pressure() -> resources::pressure::PressureLevel {
    log::info!("resource.pressure invoked");
    resources::pressure::evaluate()
}

#[tauri::command]
fn resource_pressure_with_input(input: resources::pressure::PressureInput) -> resources::pressure::PressureLevel {
    log::info!("resource.pressure_with_input invoked");
    resources::pressure::compute_pressure(&input)
}

// ---- STEP 12: Activity Detection IPC (§16, §6, §22, §23) - observe-only ----

#[allow(non_snake_case)]
#[tauri::command]
fn resource_activity_check(
    pid: u32,
    hwnd: u64,
    app_id: Option<String>,
    appId: Option<String>,
) -> resource_manager::activity::ActivityInfo {
    let id = appId.or(app_id).unwrap_or_default();
    log::info!("resource.activity_check pid={} hwnd={} app_id={}", pid, hwnd, id);
    resource_manager::activity::detect_activity(pid, hwnd, &id)
}

#[allow(non_snake_case)]
#[tauri::command]
fn resource_is_protected(
    hwnd: u64,
    pid: u32,
    app_id: Option<String>,
    appId: Option<String>,
) -> bool {
    let id = appId.or(app_id).unwrap_or_default();
    resource_manager::activity::is_protected_activity(hwnd, pid, &id)
}

#[allow(non_snake_case)]
#[tauri::command]
fn resource_is_game(app_id: Option<String>, appId: Option<String>) -> bool {
    let id = appId.or(app_id).unwrap_or_default();
    resource_manager::activity::is_game_category(&id)
}

#[tauri::command]
fn resource_activity_state(hwnd: u64) -> resource_manager::activity::ActivityState {
    resource_manager::activity::get_activity_state(hwnd)
}

// ---- STEP 14: Gentle Resource Optimization IPC (§19, §20 Level1, §21, §40, §36) ----
#[tauri::command]
fn resource_gentle_optimize(pid: u32, hwnd: Option<u64>) -> Result<resource_manager::optimizer::OptimizerResult, String> {
    log::info!("resource.gentle_optimize pid={} hwnd={:?}", pid, hwnd);
    let optimizer = resource_manager::optimizer::GentleOptimizer::new();
    optimizer.try_gentle_optimize(pid, hwnd)
}

#[allow(non_snake_case)]
#[tauri::command]
fn resource_gentle_optimize_by_app(pid: u32, hwnd: Option<u64>, app_id: Option<String>, appId: Option<String>) -> Result<resource_manager::optimizer::OptimizerResult, String> {
    let _id = appId.or(app_id).unwrap_or_default();
    // app_id hint currently unused beyond resolver; kept for forward-compat (§39 provider)
    log::info!("resource.gentle_optimize_by_app pid={} hwnd={:?} app_id={}", pid, hwnd, _id);
    let optimizer = resource_manager::optimizer::GentleOptimizer::new();
    optimizer.try_gentle_optimize(pid, hwnd)
}

// ---- STEP 15: Aggressive Resource Optimization IPC (§20 Level2, §21, §19, §40, §36) ----
#[tauri::command]
fn resource_aggressive_optimize(pid: u32, hwnd: Option<u64>) -> Result<resource_manager::optimizer::OptimizerResult, String> {
    log::info!("resource.aggressive_optimize pid={} hwnd={:?}", pid, hwnd);
    let optimizer = resource_manager::optimizer::AggressiveOptimizer::new();
    optimizer.try_aggressive_optimize(pid, hwnd)
}

#[allow(non_snake_case)]
#[tauri::command]
fn resource_aggressive_optimize_by_app(pid: u32, hwnd: Option<u64>, app_id: Option<String>, appId: Option<String>) -> Result<resource_manager::optimizer::OptimizerResult, String> {
    let _id = appId.or(app_id).unwrap_or_default();
    log::info!("resource.aggressive_optimize_by_app pid={} hwnd={:?} app_id={}", pid, hwnd, _id);
    let optimizer = resource_manager::optimizer::AggressiveOptimizer::new();
    optimizer.try_aggressive_optimize(pid, hwnd)
}

// ---- STEP 13: Lifecycle Engine IPC (§17, §18, §13, §16, §15) - observe-only, no mutation ----

#[allow(non_snake_case)]
#[tauri::command]
fn lifecycle_evaluate(
    pid: u32,
    hwnd: u64,
    app_id: Option<String>,
    appId: Option<String>,
) -> resource_manager::lifecycle::LifecycleState {
    let id = appId.or(app_id).unwrap_or_default();
    log::info!("lifecycle.evaluate pid={} hwnd={} app_id={}", pid, hwnd, id);
    resource_manager::lifecycle::evaluate_lifecycle(pid, hwnd, &id)
}

#[tauri::command]
fn lifecycle_compute(
    input: resource_manager::lifecycle::LifecycleInput,
) -> resource_manager::lifecycle::LifecycleState {
    log::info!("lifecycle.compute input={:?}", input);
    resource_manager::lifecycle::compute_lifecycle(&input)
}

#[tauri::command]
fn lifecycle_get_state(
    pid: u32,
    hwnd: u64,
    app_id: Option<String>,
) -> resource_manager::lifecycle::LifecycleState {
    let id = app_id.unwrap_or_default();
    resource_manager::lifecycle::evaluate_lifecycle(pid, hwnd, &id)
}

// ---- STEP 16: Game Classification + Protection IPC (§6, §23, §48) - observe-only ----
#[allow(non_snake_case)]
#[tauri::command]
fn app_classify(app_id: Option<String>, appId: Option<String>) -> Option<applications::classifier::GameClass> {
    let id = appId.or(app_id)?;
    let desc = applications::registry::get_by_id(&id)?;
    Some(applications::classifier::classify(&desc))
}

#[allow(non_snake_case)]
#[tauri::command]
fn app_is_game_protected(app_id: Option<String>, appId: Option<String>) -> bool {
    let id = match appId.or(app_id) {
        Some(v) => v,
        None => return false,
    };
    let Some(desc) = applications::registry::get_by_id(&id) else {
        return false;
    };
    let class = applications::classifier::classify(&desc);
    resource_manager::protection::is_game_protected(class)
}

// ---- STEP 18: Global Hotkeys IPC (§32, §48, §36) ----
#[tauri::command]
fn hotkey_list() -> Vec<hotkeys::global::HotkeyDef> {
    hotkeys::global::all_hotkeys()
}

#[tauri::command]
fn hotkey_is_registered(app: tauri::AppHandle, accelerator: String) -> bool {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    // is_registered returns bool in 2.3.x; handle both signatures via match
    app.global_shortcut().is_registered(accelerator.as_str())
}

#[allow(non_snake_case)]
#[tauri::command]
fn hotkey_register(app: tauri::AppHandle, id: Option<String>, accelerator: Option<String>) -> Result<(), String> {
    // Prefer id, fallback to accelerator for ad-hoc - STEP 20 validation (§32, §43)
    if let Some(id_str) = id.or(accelerator.clone()) {
        let trimmed = id_str.trim().to_string();
        if trimmed.is_empty() {
            return Err(crate::error::AzaleaError::InvalidPath("id/accelerator must not be empty".into()).to_string());
        }
        if trimmed.contains('\0') {
            return Err(crate::error::AzaleaError::InvalidPath("id/accelerator contains null byte".into()).to_string());
        }
        if trimmed.len() > 64 {
            return Err(crate::error::AzaleaError::InvalidPath("id/accelerator too long".into()).to_string());
        }
        // try known id first
        if hotkeys::global::HotkeyId::from_str(&trimmed).is_some() {
            return hotkeys::global::register_single_by_id(&app, &trimmed).map_err(|e| e.to_string());
        }
        // ad-hoc accelerator string - attempt direct register with generic emit (narrow: still validates via plugin)
        let acc = trimmed.clone();
        let acc2 = acc.clone();
        use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
        let res = app.global_shortcut().on_shortcut(acc.as_str(), move |app_h, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                log::info!("hotkey.triggered ad-hoc accelerator={}", acc2);
                let _ = app_h.emit("azalea:hotkey", serde_json::json!({ "accelerator": acc2, "idStr": acc2 }));
            }
        });
        return res.map_err(|e| crate::error::AzaleaError::HotkeyRegistrationFailed(e.to_string()).to_string());
    }
    Err(crate::error::AzaleaError::InvalidPath("missing id/accelerator".into()).to_string())
}

#[tauri::command]
fn hotkey_unregister(app: tauri::AppHandle, accelerator: String) -> Result<(), String> {
    // STEP 20 hardening: validate accelerator before unregister (§32, §43)
    if accelerator.trim().is_empty() {
        return Err(crate::error::AzaleaError::InvalidPath("accelerator must not be empty".into()).to_string());
    }
    if accelerator.contains('\0') {
        return Err(crate::error::AzaleaError::InvalidPath("accelerator contains null byte".into()).to_string());
    }
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    app.global_shortcut()
        .unregister(accelerator.as_str())
        .map_err(|e| crate::error::AzaleaError::HotkeyRegistrationFailed(e.to_string()).to_string())
}

// ---- STEP 17: Filesystem Bridge IPC (§31, §43, §36, §3) ----
#[tauri::command]
fn filesystem_list(path: String) -> Result<Vec<filesystem::FsEntry>, String> {
    filesystem::list_dir(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn filesystem_get_metadata(path: String) -> Result<filesystem::FsEntry, String> {
    filesystem::get_metadata(&path).map_err(|e| e.to_string())
}

#[allow(non_snake_case)]
#[tauri::command]
fn filesystem_create_folder(
    parent: Option<String>,
    path: Option<String>,
    name: String,
) -> Result<filesystem::FsEntry, String> {
    let p = parent.or(path).ok_or_else(|| AzaleaError::InvalidPath("missing parent/path".into()).to_string())?;
    filesystem::create_folder(&p, &name).map_err(|e| e.to_string())
}

#[allow(non_snake_case)]
#[tauri::command]
fn filesystem_rename(
    path: String,
    newName: Option<String>,
    new_name: Option<String>,
) -> Result<filesystem::FsEntry, String> {
    let nn = newName.or(new_name).ok_or_else(|| AzaleaError::InvalidPath("missing newName".into()).to_string())?;
    filesystem::rename(&path, &nn).map_err(|e| e.to_string())
}

#[tauri::command]
fn filesystem_move(src: String, dst: String) -> Result<(), String> {
    filesystem::move_entry(&src, &dst).map_err(|e| e.to_string())
}

#[tauri::command]
fn filesystem_copy(src: String, dst: String) -> Result<(), String> {
    filesystem::copy_entry(&src, &dst).map_err(|e| e.to_string())
}

#[tauri::command]
fn filesystem_delete(path: String) -> Result<(), String> {
    filesystem::delete_entry(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn filesystem_picker_open() -> Option<String> {
    filesystem::open_picker()
}

#[tauri::command]
fn filesystem_recent() -> Vec<filesystem::FsEntry> {
    filesystem::get_recent()
}

#[tauri::command]
fn filesystem_open(path: String) -> Result<(), String> {
    // MVP stub: validate path exists, log, return Ok (no shell open for safety §43)
    // STEP 20 hardening: reject \0, empty, control chars, and Windows max path length
    if path.trim().is_empty() || path.contains('\0') {
        return Err(AzaleaError::InvalidPath("invalid path".into()).to_string());
    }
    if path.contains('\0') || path.chars().any(|c| c.is_control()) {
        return Err(AzaleaError::InvalidPath("path contains control char".into()).to_string());
    }
    if path.len() > 32767 {
        return Err(AzaleaError::InvalidPath("path too long".into()).to_string());
    }
    if !std::path::Path::new(&path).exists() {
        return Err(AzaleaError::InvalidPath(format!("path not found: {}", path)).to_string());
    }
    log::info!("filesystem.open path={}", path);
    Ok(())
}

// ---- STEP 19: Diagnostics + Recovery IPC (§34, §35, §37, §3) ----
#[tauri::command]
fn diagnostics_get_report() -> diagnostics::report::DiagnosticsReport {
    log::info!(target: "diagnostics", "diagnostics.get_report invoked");
    diagnostics::report::generate_report()
}

#[tauri::command]
fn diagnostics_export(path: Option<String>) -> Result<String, String> {
    log::info!(target: "diagnostics", "diagnostics.export invoked path={:?}", path);
    diagnostics::report::export_diagnostics(path)
}

#[tauri::command]
fn core_health() -> diagnostics::health::CoreHealth {
    log::info!(target: "core", "core.health invoked");
    diagnostics::health::core_health()
}

#[tauri::command]
fn check_app_crashed(pid: u32) -> bool {
    let crashed = diagnostics::crash::check_app_crashed(pid);
    log::info!(target: "core", "managed.app_crashed_check pid={} crashed={}", pid, crashed);
    crashed
}

// ---- STEP 23: Performance Pass IPC (§48 STEP 23, §33, §23) ----
// Minimal bench harness via Instant (10-iter avg) covering process_list, window tracker,
// resource_snapshot, app_list. Caching kept: cpu sampler OnceLock already (§33), no extra
// cache needed - samplers are O(1) or O(n) fast enough and must stay fresh.
// Findings documented in diagnostics::performance::PerformanceReport.
#[tauri::command]
fn performance_report() -> diagnostics::performance::PerformanceReport {
    log::info!(target: "diagnostics", "performance.report invoked");
    diagnostics::performance::performance_report()
}

// ---- STEP 24: Reliability Pass IPC (§48 STEP 24, §37, §36) ----
// Reliability simulation - no new feature, only reliability handling/tests.
// Handlers: appCrash->lifecycle ERROR, azaleaCrash->panic hook, explorerRestart->EnumWindows fresh,
// displayChanged->GetWindowRect bounds refresh, sleepWake/monitorDisconnect->re-sample, windowsRestart/logoutLogin->persisted state,
// permissionDenied->FilesystemAccessDenied, executableRemoved->AppNotFound. All return resilient|degraded never panic.
#[tauri::command]
fn reliability_report(scenario: Option<String>) -> diagnostics::reliability::ReliabilityReport {
    let raw = scenario.unwrap_or_else(|| "appCrash".to_string());
    log::info!(target: "diagnostics", "reliability.report scenario={}", raw);
    diagnostics::reliability::simulate_str(&raw)
}

#[tauri::command]
fn reliability_check(scenario: String) -> diagnostics::reliability::ReliabilityReport {
    log::info!(target: "diagnostics", "reliability.check scenario={}", scenario);
    diagnostics::reliability::simulate_str(&scenario)
}

#[tauri::command]
fn reliability_report_all() -> Vec<diagnostics::reliability::ReliabilityReport> {
    log::info!(target: "diagnostics", "reliability.report_all invoked");
    diagnostics::reliability::simulate_all()
}

// FORBIDDEN: executable has no runtime flag to change edition (no --lite, no --edition, no env toggle).
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            health,
            get_capabilities,
            get_edition,
            get_config_dir,
            get_log_dir,
            config_get,
            config_set,
            app_list,
            app_get_state,
            process_list,
            process_get_metrics,
            process_is_alive,
            window_list,
            window_get_foreground,
            window_get_bounds,
            window_focus,
            window_minimize,
            window_restore,
            window_set_bounds,
            window_is_visible,
            window_can_host,
            window_try_host,
            window_resize_hosted,
            window_focus_hosted,
            window_close_hosted,
            app_launch,
            workspace_list,
            workspace_get,
            workspace_active,
            workspace_create,
            workspace_rename,
            workspace_close,
            workspace_switch,
            workspace_add_app,
            workspace_remove_app,
            workspace_get_apps,
            workspace_list_all_app_tabs,
            resource_snapshot,
            resource_get_process,
            resource_pressure,
            resource_pressure_with_input,
            resource_activity_check,
            resource_is_protected,
            resource_is_game,
            resource_activity_state,
            lifecycle_evaluate,
            lifecycle_compute,
            lifecycle_get_state,
            resource_gentle_optimize,
            resource_gentle_optimize_by_app,
            resource_aggressive_optimize,
            resource_aggressive_optimize_by_app,
            app_classify,
            app_is_game_protected,
            filesystem_list,
            filesystem_get_metadata,
            filesystem_create_folder,
            filesystem_rename,
            filesystem_move,
            filesystem_copy,
            filesystem_delete,
            filesystem_picker_open,
            filesystem_recent,
            filesystem_open,
            hotkey_list,
            hotkey_is_registered,
            hotkey_register,
            hotkey_unregister,
            diagnostics_get_report,
            diagnostics_export,
            core_health,
            check_app_crashed,
            performance_report,
            reliability_report,
            reliability_check,
            reliability_report_all
        ])
        .setup(|app| {
            // Build AppState - resolves %LOCALAPPDATA%\AzaleaOS\Full (or Tauri fallback) and ensures dirs
            let state = AppState::new(app.handle()).unwrap_or_else(|e| {
                eprintln!("AppState init failed: {}", e);
                // Fallback state for diagnostics
                let fallback_base = std::env::var("LOCALAPPDATA")
                    .map(|p| std::path::PathBuf::from(p).join("AzaleaOS").join("Full"))
                    .unwrap_or_else(|_| std::env::temp_dir().join("AzaleaOS").join("Full"));
                let _ = std::fs::create_dir_all(&fallback_base);
                let _ = std::fs::create_dir_all(fallback_base.join("Logs"));
                let _ = std::fs::create_dir_all(fallback_base.join("Cache"));
                AppState {
                    edition: Edition::current(),
                    capabilities: Capabilities::from_edition(Edition::current()),
                    config_dir: fallback_base.clone(),
                    log_dir: fallback_base.join("Logs"),
                    cache_dir: fallback_base.join("Cache"),
                }
            });

            // Ensure config dir via repository helper (placeholder for STEP 2)
            let _ = config::repository::ensure_config_dir(&state.config_dir);

            // STEP 19: install panic hook first - Core crash containment per §37
            diagnostics::crash::install_panic_hook();

            // Init structured logging at INFO to Logs/AzaleaOS-Full.log
            if let Err(e) = diagnostics::logging::init_logging(&state.log_dir) {
                eprintln!("init_logging failed: {}", e);
            } else {
                log::info!(target: "app", "config_dir={}", state.config_dir.display());
                log::info!(target: "app", "cache_dir={}", state.cache_dir.display());
                log::info!(target: "core", "core.health init ok");
                log::info!(target: "diagnostics", "diagnostics.init ok ui_restart_strategy={}", diagnostics::crash::ui_restart_strategy());
            }

            // STEP 7: WorkspaceManager - load persisted workspaces/workspaces.json or seeded default
            let ws_manager = workspace::WorkspaceManager::new(state.config_dir.clone());
            log::info!(
                "workspace.init workspaces={} active={:?}",
                ws_manager.get_workspaces().len(),
                ws_manager.get_active_id()
            );
            app.manage(ws_manager);

            app.manage(state);

            // STEP 18: Global Hotkeys - register 9 accelerators, WARN not panic on conflict (§32)
            {
                let handle = app.handle().clone();
                if let Err(e) = hotkeys::global::register_hotkeys(&handle) {
                    log::warn!("hotkey.setup failed: {}", e);
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // graceful unregister on shutdown (§32)
                hotkeys::global::unregister_all(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running AzaleaOS Full");
}
