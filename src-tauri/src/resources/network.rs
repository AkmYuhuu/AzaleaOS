/// Network metrics stub - §14.1 network_rx / network_tx in bytes/sec
/// MVP returns (0,0). Real impl would query GetIfTable / IP Helper or performance counters.
pub fn sample_network() -> (u64, u64) {
    (0, 0)
}
