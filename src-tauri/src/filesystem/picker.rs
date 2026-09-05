/// Windows file picker integration - §31 filesystem bridge.
/// For MVP stub returns None with INFO log; frontend keeps HTML file input mock.
/// Expose command so frontend can call and handle Option.
pub fn open_picker() -> Option<String> {
    log::info!("filesystem.picker_open stub - not implemented without UI, returning None");
    None
}
