use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum DaemonState {
    Stopped,
    Starting,
    Running,
    Working,
    Alert,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DaemonMsg {
    Heartbeat {
        daemon_id: String,
        state: DaemonState,
        timestamp: DateTime<Utc>,
    },
    Log {
        daemon_id: String,
        message: String,
        level: String, // "INFO", "WARN", "ERROR", "CRITICAL"
        timestamp: DateTime<Utc>,
    },
    ReconResult {
        target_ip: String,
        vulnerabilities: Vec<String>,
        summary: String,
        timestamp: DateTime<Utc>,
    },
    ThreatAnalysis {
        target_ip: String,
        threat_level: String,
        summary: String,
        recommendation: String,
        timestamp: DateTime<Utc>,
    },
    IceResponse {
        target_ip: String,
        action: String, // "QUARANTINE_TRIGGERED", "NO_ACTION", "BLOCK_INJECTED"
        reason: String,
        timestamp: DateTime<Utc>,
    },
    GhostDeception {
        deception_type: String, // "FAKE_PORT_HIT", "HONEYPOT_ALERT"
        details: String,
        timestamp: DateTime<Utc>,
    },
    NetHost(crate::net::NetHost),
}
