# AzaleaOS Full - Packaging Readiness (STEP 25)

## Identity
- ProductName: `AzaleaOS Full`
- Identifier: `com.azalea.azaleaos.full`
- Executable: `azaleaos-full.exe`
- Version: `0.1.0` (sync: `tauri.conf.json` == `Cargo.toml` == `package.json`)
- Config root: `%LOCALAPPDATA%\AzaleaOS\Full`
- Cache: `%LOCALAPPDATA%\AzaleaOS\Full\Cache`
- Logs: `%LOCALAPPDATA%\AzaleaOS\Full\Logs\AzaleaOS-Full.log`
- Diagnostics: `%LOCALAPPDATA%\AzaleaOS\Full\diagnostics\`

## Bundle
- `tauri.conf.json` → `bundle.active=true`, `targets=all`, `icon=[icon.png,icon.ico]`, `resources=[]`
- `bundle.windows.wix.language=en-US` (fallback en-US), `upgradeCode=B2E8F9A1-3C4D-4E5F-8A6B-7C8D9E0F1A2B` (stable - keep forever for upgrades)
- `bundle.windows.nsis.installMode=currentUser` (no UAC, least privilege §43), `languages=[English]`; perMachine alternative requires admin - document for future enterprise channel
- Icons present: `src-tauri/icons/icon.png`, `icon.ico`

## Install / Upgrade / Uninstall
- Install: `cargo tauri build` → `nsis` + `wix` installers in `src-tauri/target/release/bundle/`
- Upgrade: stable `upgradeCode` guarantees WiX major upgrade retains `%LOCALAPPDATA%\AzaleaOS\Full`; version bump 0.1.0→0.2.0 keeps data; test on VM with previous msi
- Uninstall: Tauri/WiX/NSIS default **preserves** `%LOCALAPPDATA%\AzaleaOS\Full` (config/cache/logs/diagnostics). User must manually delete if desired. No `removeAppData` on uninstall. Documented in `tauri.conf.json` → `plugins.packagingNotes`.

## Config Preservation Policy
- Uninstall keeps `config.json`, `workspaces.json`, `Cache/`, `Logs/`, `diagnostics/` unless user opts to remove
- Downgrade / reinstall retains files (atomic write via `config.json.tmp` rename)
- No cloud, no registry dependency for config

## Logs / Diagnostics (§34/35)
- `diagnostics::logging::init_logging(&log_dir)` → fern INFO to `Logs/AzaleaOS-Full.log` + stdout, format `YYYY-MM-DD HH:MM:SS [LEVEL] [target] message`
- `diagnostics::report::generate_report()` → Azalea version / Windows version / arch / edition / CPU/RAM/GPU summary / known_issues / recent_errors (WARN/ERROR tail)
- `export_diagnostics(path)` → `diagnostics/AzaleaDiagnostics_<ts>.json` with log_tail, local only, no upload
- `lib.rs` setup ensures `Logs/`, `Cache/` dirs via `AppState::new()` + `ensure_config_dir()`; fallback to TEMP if LOCALAPPDATA missing

## Signing Preparation (no cert bundled)
- Wix/Nsis signing placeholder: `tauri signer` ready
- Steps when cert available: `tauri signer sign --private-key ... --cert ... target/release/bundle/...`
- Do not bundle updater/plugin backdoor (§47): no `tauri-plugin-updater`, no `updater` config in `tauri.conf.json`
- No `--lite` flag, no `AZALEA_EDITION` env var, no `std::env::args` inspection - Full hardcoded (`Edition::Full`, `FULL_CAPABILITIES`)

## Release Channel
- Single release channel `stable` (0.1.0 MVP); no auto-update bundled; future channel gated by separate tauri updater config (not in MVP)
- Build reproducibility: Rust `1.77.2` pinned in `Cargo.toml` `rust-version`

## Checklist
- [x] `identifier`/`productName`/`version` correct
- [x] `bundle.windows.wix.upgradeCode` stable
- [x] `bundle.windows.nsis.installMode` currentUser documented
- [x] `Cargo.toml` version sync
- [x] Logs/diagnostics dirs created in `lib.rs`
- [x] Preservation policy documented
- [x] No updater/lite/cloud
- [x] Signing placeholder
- [x] `cargo check` passes
- [x] `npm run build` passes

## Verify
```powershell
cargo check
cargo build
npm run build
# tauri build (requires WiX Toolset + NSIS on Windows host)
# cargo tauri build
```
