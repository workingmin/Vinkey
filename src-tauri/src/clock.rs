//! Wall-clock helpers shared by the persistence, job and worker modules.

use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since the Unix epoch; pre-epoch clocks saturate to 0.
pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Signed variant for SQLite `INTEGER` columns.
pub(crate) fn now_ms_i64() -> i64 {
    now_ms() as i64
}
