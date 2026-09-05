/// Disk activity percent 0..100 - §14.1 disk_activity
/// MVP stub: real impl would use Performance Counters or GetDiskFreeSpaceEx delta.
/// Return 0.0 to satisfy type contract without panicking.
pub fn sample_disk() -> f32 {
    0.0
}
