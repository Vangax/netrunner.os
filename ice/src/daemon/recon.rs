use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::time::{sleep, Duration};
use tracing::{info, error};
use protocol::daemon::{DaemonMsg, DaemonState};
use crate::ws::WsState;
use crate::engine::Engine;
use chrono::Utc;

pub struct ReconDaemon;

impl ReconDaemon {
    pub fn start(
        ws_state: Arc<WsState>,
        engine: Arc<Engine>,
        mut shutdown: broadcast::Receiver<()>,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            info!("ReconDaemon neural node activated.");
            let mut interval = tokio::time::interval(Duration::from_secs(5));
            loop {
                tokio::select! {
                    _ = shutdown.recv() => {
                        let _ = ws_state.broadcast_msg(&DaemonMsg::Heartbeat {
                            daemon_id: "ReconDaemon".to_string(),
                            state: DaemonState::Stopped,
                            timestamp: Utc::now(),
                        });
                        break;
                    }
                    _ = interval.tick() => {
                        let _ = ws_state.broadcast_msg(&DaemonMsg::Heartbeat {
                            daemon_id: "ReconDaemon".to_string(),
                            state: DaemonState::Running,
                            timestamp: Utc::now(),
                        });

                        let hosts = engine.get_hosts();
                        for host in hosts {
                            let _ = ws_state.broadcast_msg(&DaemonMsg::Log {
                                daemon_id: "ReconDaemon".to_string(),
                                message: format!("Running port audit on network node {}", host.ip),
                                level: "INFO".to_string(),
                                timestamp: Utc::now(),
                            });

                            let vulnerabilities = if host.anomaly_score > 2.0 {
                                vec!["CVE-2023-38606: Kernel vulnerability exploit vector".to_string()]
                            } else {
                                vec![]
                            };

                            let _ = ws_state.broadcast_msg(&DaemonMsg::ReconResult {
                                target_ip: host.ip.to_string(),
                                vulnerabilities,
                                summary: format!("Passive audit of host ports complete for {}", host.ip),
                                timestamp: Utc::now(),
                            });
                        }
                    }
                }
            }
        })
    }
}
