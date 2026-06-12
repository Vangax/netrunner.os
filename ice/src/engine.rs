use neo4rs::{Graph, query};
use protocol::net::{NetPacket, NetHost, NetEdge};
use crate::config::Config;
use crate::topology::calculate_3d_coordinates;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{info, error};

#[derive(Debug, Clone)]
pub struct HostStats {
    pub count: u64,
    pub mean_time_delta_ms: f64,
    pub var_time_delta_ms: f64,
    pub last_packet_time: chrono::DateTime<chrono::Utc>,
}

pub struct Engine {
    graph: Arc<Graph>,
    packet_buffer: Arc<Mutex<Vec<NetPacket>>>,
    host_stats: Arc<Mutex<HashMap<String, HostStats>>>,
    hosts: Arc<Mutex<HashMap<String, NetHost>>>,
    local_ip: Option<std::net::IpAddr>,
}

impl Engine {
    fn get_nearby_wifi() -> Vec<String> {
        use std::process::Command;
        let mut ssids = Vec::new();
        if let Ok(output) = Command::new("cmd").args(["/C", "netsh wlan show networks"]).output() {
            if let Ok(stdout) = String::from_utf8(output.stdout) {
                for line in stdout.lines() {
                    if line.contains("SSID") {
                        if let Some((_, ssid_part)) = line.split_once(':') {
                            let ssid = ssid_part.trim().to_string();
                            if !ssid.is_empty() && !ssids.contains(&ssid) {
                                ssids.push(ssid);
                            }
                        }
                    }
                }
            }
        }
        if ssids.is_empty() {
            ssids = vec![
                "Corporate_Guest_WiFi".to_string(),
                "NetGear_Secure_5G".to_string(),
                "Xfinity_Hotspot_Free".to_string(),
            ];
        }
        ssids
    }

    pub async fn new(config: &Config) -> anyhow::Result<Self> {
        let graph = Graph::new(&config.neo4j_uri, &config.neo4j_user, &config.neo4j_pass).await?;
        
        let mut hosts_map = HashMap::new();

        // 1. Wifi Beacons (distant red spires)
        let wifi_names = Self::get_nearby_wifi();
        let wifi_ips = vec!["10.200.0.1", "10.200.0.2", "10.200.0.3"];
        for (i, ip_str) in wifi_ips.iter().enumerate() {
            let ip: std::net::IpAddr = ip_str.parse().unwrap();
            let hostname = wifi_names.get(i).cloned().unwrap_or_else(|| format!("WiFi_Beacon_{}", i));
            hosts_map.insert(ip_str.to_string(), NetHost {
                ip,
                mac: Some(format!("00:11:22:33:44:A{:X}", i)),
                hostname: Some(hostname),
                ports: Vec::new(),
                os: None,
                last_seen: chrono::Utc::now(),
                anomaly_score: 0.0,
                coords: [0.0, 0.0, 0.0],
                ice_integrity: 100.0,
                is_quarantined: false,
                packet_count: 0,
                device_type: "wifi_beacon".to_string(),
                signal_strength: Some(0.8 - (i as f32) * 0.1),
            });
        }

        // 2. Bluetooth Devices (small purple orbs with manufacturer labels)
        let bt_ips = vec!["10.210.0.1", "10.210.0.2", "10.210.0.3"];
        let bt_names = vec!["Apple, Inc. (iPhone 15)", "Sony Corp (WH-1000XM4)", "Logitech, Inc. (MX Master 3)"];
        for (i, ip_str) in bt_ips.iter().enumerate() {
            let ip: std::net::IpAddr = ip_str.parse().unwrap();
            hosts_map.insert(ip_str.to_string(), NetHost {
                ip,
                mac: Some(format!("BB:CC:DD:EE:FF:1{:X}", i)),
                hostname: Some(bt_names[i].to_string()),
                ports: Vec::new(),
                os: None,
                last_seen: chrono::Utc::now(),
                anomaly_score: 0.0,
                coords: [0.0, 0.0, 0.0],
                ice_integrity: 100.0,
                is_quarantined: false,
                packet_count: 0,
                device_type: "bluetooth".to_string(),
                signal_strength: Some(0.7 - (i as f32) * 0.15),
            });
        }

        // 3. Probe Requests (flickering ghost silhouettes)
        let probe_ips = vec!["10.220.0.1", "10.220.0.2"];
        for (i, ip_str) in probe_ips.iter().enumerate() {
            let ip: std::net::IpAddr = ip_str.parse().unwrap();
            hosts_map.insert(ip_str.to_string(), NetHost {
                ip,
                mac: None,
                hostname: Some("Ghost Probe Request".to_string()),
                ports: Vec::new(),
                os: None,
                last_seen: chrono::Utc::now(),
                anomaly_score: 1.0,
                coords: [0.0, 0.0, 0.0],
                ice_integrity: 100.0,
                is_quarantined: false,
                packet_count: 0,
                device_type: "probe_request".to_string(),
                signal_strength: Some(0.5),
            });
        }

        // Detect local host IP address
        let local_ip = if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
            if socket.connect("8.8.8.8:80").is_ok() {
                socket.local_addr().ok().map(|addr| addr.ip())
            } else {
                None
            }
        } else {
            None
        };

        if let Some(ip) = local_ip {
            info!("Detected local host IP address: {}", ip);
            hosts_map.insert(ip.to_string(), NetHost {
                ip,
                mac: None,
                hostname: Some("Local Host (Self)".to_string()),
                ports: Vec::new(),
                os: Some("Windows (Target)".to_string()),
                last_seen: chrono::Utc::now(),
                anomaly_score: 0.0,
                coords: [0.0, 0.0, 0.0],
                ice_integrity: 100.0,
                is_quarantined: false,
                packet_count: 0,
                device_type: "self".to_string(),
                signal_strength: None,
            });
        }

        Ok(Self {
            graph: Arc::new(graph),
            packet_buffer: Arc::new(Mutex::new(Vec::new())),
            host_stats: Arc::new(Mutex::new(HashMap::new())),
            hosts: Arc::new(Mutex::new(hosts_map)),
            local_ip,
        })
    }

    pub fn get_hosts(&self) -> Vec<NetHost> {
        let hosts = self.hosts.lock().unwrap();
        hosts.values().cloned().collect()
    }

    pub fn get_host(&self, ip: &str) -> Option<NetHost> {
        let hosts = self.hosts.lock().unwrap();
        hosts.get(ip).cloned()
    }

    pub fn update_host(&self, host: NetHost) {
        let mut hosts = self.hosts.lock().unwrap();
        hosts.insert(host.ip.to_string(), host);
    }

    pub fn ingest_packet(&self, pkt: NetPacket) {
        // Buffer packet for batched Neo4j writes
        {
            let mut buf = self.packet_buffer.lock().unwrap();
            buf.push(pkt.clone());
        }

        // Bayesian thresholds & baseline learning
        self.learn_baseline(&pkt);
    }

    fn learn_baseline(&self, pkt: &NetPacket) {
        let src_ip = pkt.src_ip.to_string();
        let mut stats = self.host_stats.lock().unwrap();
        let entry = stats.entry(src_ip.clone()).or_insert_with(|| HostStats {
            count: 0,
            mean_time_delta_ms: 0.0,
            var_time_delta_ms: 0.0,
            last_packet_time: pkt.timestamp,
        });

        entry.count += 1;

        let mut hosts = self.hosts.lock().unwrap();
        let is_self = self.local_ip.map(|lip| pkt.src_ip == lip).unwrap_or(false);

        let host_entry = hosts.entry(src_ip.clone()).or_insert_with(|| NetHost {
            ip: pkt.src_ip,
            mac: None,
            hostname: if is_self { Some("Local Host (Self)".to_string()) } else { None },
            ports: Vec::new(),
            os: if is_self { Some("Windows (Target)".to_string()) } else { None },
            last_seen: pkt.timestamp,
            anomaly_score: 0.0,
            coords: [0.0, 0.0, 0.0],
            ice_integrity: 100.0,
            is_quarantined: false,
            packet_count: 0,
            device_type: if is_self { "self".to_string() } else { "standard".to_string() },
            signal_strength: None,
        });

        host_entry.last_seen = pkt.timestamp;
        host_entry.packet_count = entry.count as u32;

        if entry.count > 1 {
            let delta = pkt.timestamp.signed_duration_since(entry.last_packet_time).num_milliseconds() as f64;
            let old_mean = entry.mean_time_delta_ms;
            
            // Welford's algorithm for running variance/mean calculation
            entry.mean_time_delta_ms += (delta - old_mean) / entry.count as f64;
            entry.var_time_delta_ms += (delta - old_mean) * (delta - entry.mean_time_delta_ms);
            
            // Compute anomaly score
            let std_dev = (entry.var_time_delta_ms / entry.count as f64).sqrt();
            if std_dev > 0.0 {
                let dev = (delta - entry.mean_time_delta_ms).abs() / std_dev;
                host_entry.anomaly_score = dev;
            }
        }
        entry.last_packet_time = pkt.timestamp;
    }

    pub fn start_batch_loop(
        &self,
        ws_state: Arc<crate::ws::WsState>,
        mut shutdown: tokio::sync::broadcast::Receiver<()>,
    ) {
        let graph = self.graph.clone();
        let buffer = self.packet_buffer.clone();
        let hosts = self.hosts.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(100));
            let mut tick_count = 0;
            loop {
                tokio::select! {
                    _ = shutdown.recv() => {
                        info!("Shutting down batch engine loop.");
                        break;
                    }
                    _ = interval.tick() => {
                        tick_count += 1;

                        // Retrieve packets
                        let packets = {
                            let mut buf = buffer.lock().unwrap();
                            if !buf.is_empty() {
                                std::mem::take(&mut *buf)
                            } else {
                                Vec::new()
                            }
                        };

                        // Perform force-directed layout updates and signal device flicker
                        let hs_list = {
                            let mut hs = hosts.lock().unwrap();
                            let mut rng = rand::thread_rng();
                            use rand::Rng;
                            for host in hs.values_mut() {
                                if host.device_type == "probe_request" {
                                    if rng.gen_bool(0.15) {
                                        host.signal_strength = Some(rng.gen_range(0.1..1.0));
                                    }
                                    if rng.gen_bool(0.05) {
                                        // Toggle ghost presence
                                        host.signal_strength = if host.signal_strength.is_none() {
                                            Some(rng.gen_range(0.1..1.0))
                                        } else {
                                            None
                                        };
                                    }
                                } else if host.device_type == "bluetooth" || host.device_type == "wifi_beacon" {
                                    if rng.gen_bool(0.05) {
                                        host.signal_strength = Some(rng.gen_range(0.4..0.9));
                                    }
                                }
                            }
                            calculate_3d_coordinates(&mut hs);
                            hs.values().cloned().collect::<Vec<_>>()
                        };

                        // Periodically (every 1 second / 10 ticks) broadcast all hosts
                        if tick_count % 10 == 0 {
                            for host in &hs_list {
                                let msg = protocol::daemon::DaemonMsg::NetHost(host.clone());
                                let _ = ws_state.broadcast_msg(&msg);
                            }
                        }

                        // Write to Neo4j if we have packets
                        if !packets.is_empty() {
                            if let Err(e) = Self::write_batch_neo4j(&graph, &packets).await {
                                error!("Failed to write batch to Neo4j: {:?}", e);
                            }
                        }
                    }
                }
            }
        });
    }

    async fn write_batch_neo4j(graph: &Graph, packets: &[NetPacket]) -> anyhow::Result<()> {
        // Group packet flows for UNWIND batched queries
        let mut flows = Vec::new();
        for pkt in packets {
            flows.push(serde_json::json!({
                "src_ip": pkt.src_ip.to_string(),
                "dst_ip": pkt.dst_ip.to_string(),
                "src_port": pkt.src_port,
                "dst_port": pkt.dst_port,
                "protocol": pkt.protocol,
                "size": pkt.size,
                "timestamp": pkt.timestamp.to_rfc3339()
            }));
        }

        let q = query(
            "UNWIND $flows AS flow
             MERGE (s:Host {ip: flow.src_ip})
             MERGE (d:Host {ip: flow.dst_ip})
             MERGE (s)-[r:CONNECTS {proto: flow.protocol}]->(d)
             ON CREATE SET r.packet_count = 1, r.byte_count = flow.size, r.last_seen = flow.timestamp
             ON MATCH SET r.packet_count = r.packet_count + 1, r.byte_count = r.byte_count + flow.size, r.last_seen = flow.timestamp"
        ).param("flows", serde_json::to_string(&flows).unwrap_or_default());

        graph.run(q).await?;
        Ok(())
    }
}
