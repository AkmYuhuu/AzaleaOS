pub mod bounds;
pub mod enumeration;
pub mod focus;
pub mod host;
pub mod identity;
pub mod management;
pub mod tracking;

pub use bounds::{get_window_bounds, WindowBounds};
pub use enumeration::enum_windows;
pub use focus::{get_foreground_window, is_foreground};
pub use identity::{RawWindow, WindowIdentity};
pub use management::{focus_window, get_bounds, is_visible, minimize_window, restore_window, set_bounds};
pub use tracking::track_windows;
