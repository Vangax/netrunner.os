use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::time::{sleep, Duration};
use tracing::{info, error};
use protocol::daemon::{DaemonMsg, DaemonState};
use crate::ws::WsState;
use crate::engine::Engine;
use chrono::Utc;
use reqwest::Client;

pub struct ConstructDaemon;

impl ConstructDaemon {
    pub fn start(
        ws_state: Arc<WsState>,
        engine: Arc<Engine>,
        llama_url: String,
        mut shutdown: broadcast::Receiver<()>,
    ) -> tokio::task::JoinHandle<()> {
        let client = Client::new();
        tokio::spawn(async move {
            info!("ConstructDaemon neural node activated.");
            let mut interval = tokio::time::interval(Duration::from_secs(8));
            loop {
                tokio::select! {
                    _ = shutdown.recv() => {
                        let _ = ws_state.broadcast_msg(&DaemonMsg::Heartbeat {
                            daemon_id: "ConstructDaemon".to_string(),
                            state: DaemonState::Stopped,
                            timestamp: Utc::now(),
                        });
                        break;
                    }
                    _ = interval.tick() => {
                        let _ = ws_state.broadcast_msg(&DaemonMsg::Heartbeat {
                            daemon_id: "ConstructDaemon".to_string(),
                            state: DaemonState::Working,
                            timestamp: Utc::now(),
                        });

                        let hosts = engine.get_hosts();
                        for host in hosts {
                            let prompt = format!(
                                "Analyze this host: {}, ports: {:?}, services: {:?}. Identify threats. Respond in JSON with fields: threat_level, summary, recommendation.",
                                host.ip,
                                host.ports,
                                host.os
                            );

                            let mut threat_level = "LOW".to_string();
                            let mut summary = "Host exhibits baseline signatures.".to_string();
                            let mut recommendation = "No counter-intrusion countermeasures needed.".to_string();

                            let res = client.post(format!("{}/v1/chat/completions", llama_url))
                                .json(&serde_json::json!({
                                    "model": "copilot-codellama",
                                    "messages": [{"role": "user", "content": prompt}],
                                    "temperature": 0.2
                                }))
                                .timeout(Duration::from_secs(2))
                                .send()
                                .await;

                            if let Ok(response) = res {
                                if let Ok(json_body) = response.json::<serde_json::Value>().await {
                                    if let Some(content) = json_body.get("choices")
                                        .and_then(|c| c.get(0))
                                        .and_then(|c| c.get("message"))
                                        .and_then(|m| m.get("content"))
                                        .and_then(|s| s.as_str()) {
                                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(content) {
                                                threat_level = parsed.get("threat_level").and_then(|v| v.as_str()).unwrap_or("LOW").to_string();
                                                summary = parsed.get("summary").and_then(|v| v.as_str()).unwrap_or("Parsed llama output.").to_string();
                                                recommendation = parsed.get("recommendation").and_then(|v| v.as_str()).unwrap_or("No guidance.").to_string();
                                            }
                                        }
                                }
                            } else {
                                if host.anomaly_score > 3.0 {
                                    threat_level = "HIGH".to_string();
                                    summary = "Network scan rate anomalies suggest packet harvesting threat.".to_string();
                                    recommendation = "Deploy ICE quarantine firewall block IMMEDIATELY.".to_string();
                                }
                            }

                            let _ = ws_state.broadcast_msg(&DaemonMsg::ThreatAnalysis {
                                target_ip: host.ip.to_string(),
                                threat_level,
                                summary,
                                recommendation,
                                timestamp: Utc::now(),
                            });
                        }
                    }
                }
            }
        })
    }
}
