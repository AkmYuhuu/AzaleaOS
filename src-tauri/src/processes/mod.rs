pub mod discovery;
pub mod identity;
pub mod lifecycle;
pub mod metrics;

pub use discovery::list_processes;
pub use identity::ProcessIdentity;
pub use lifecycle::{get_process_info, is_alive, process_exists};
pub use metrics::{sample_one, sample_processes, ProcessMetrics};

