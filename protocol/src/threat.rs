use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum ThreatLevel {
    None,
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum IncidentState {
    Detect,
    Contain,
    Eradicate,
    Recover,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IceIntegrity {
    pub current_integrity: f64, // 0.0 to 100.0
    pub alert_count: u32,
    pub last_alert: Option<DateTime<Utc>>,
}
