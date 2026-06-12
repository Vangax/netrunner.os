use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use std::net::IpAddr;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum PortState {
    Open,
    Closed,
    Filtered,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HostPort {
    pub port: u16,
    pub protocol: String, // "TCP" or "UDP"
    pub service: Option<String>,
    pub state: PortState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetHost {
    pub ip: IpAddr,
    pub mac: Option<String>,
    pub hostname: Option<String>,
    pub ports: Vec<HostPort>,
    pub os: Option<String>,
    pub last_seen: DateTime<Utc>,
    pub anomaly_score: f64,
    pub coords: [f32; 3],
    pub ice_integrity: f64, // 0.0 to 100.0
    pub is_quarantined: bool,
    pub packet_count: u32,
    pub device_type: String, // "standard", "wifi_beacon", "bluetooth", "probe_request"
    pub signal_strength: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetPacket {
    pub timestamp: DateTime<Utc>,
    pub src_ip: IpAddr,
    pub dst_ip: IpAddr,
    pub src_port: u16,
    pub dst_port: u16,
    pub protocol: String, // "TCP", "UDP", "ICMP", etc.
    pub size: usize,
    pub raw_info: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetEdge {
    pub src: IpAddr,
    pub dst: IpAddr,
    pub timestamp: DateTime<Utc>,
    pub packet_count: u64,
    pub byte_count: u64,
    pub last_latency_ms: Option<f64>,
}
