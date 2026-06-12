use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::time::{sleep, Duration};
use tracing::{info, error};
use protocol::daemon::{DaemonMsg, DaemonState};
use crate::ws::WsState;
use crate::engine::Engine;
use chrono::Utc;

pub struct IceDaemon;

impl IceDaemon {
    pub fn start(
        ws_state: Arc<WsState>,
        engine: Arc<Engine>,
        threshold: f64,
        mut shutdown: broadcast::Receiver<()>,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            info!("IceDaemon response matrix online.");
            let mut interval = tokio::time::interval(Duration::from_secs(4));
            loop {
                tokio::select! {
                    _ = shutdown.recv() => {
                        let _ = ws_state.broadcast_msg(&DaemonMsg::Heartbeat {
                            daemon_id: "IceDaemon".to_string(),
                            state: DaemonState::Stopped,
                            timestamp: Utc::now(),
                        });
                        break;
                    }
                    _ = interval.tick() => {
                        let _ = ws_state.broadcast_msg(&DaemonMsg::Heartbeat {
                            daemon_id: "IceDaemon".to_string(),
                            state: DaemonState::Running,
                            timestamp: Utc::now(),
                        });

                        let hosts = engine.get_hosts();
                        for host in hosts {
                            if host.anomaly_score > threshold && !host.is_quarantined {
                                let _ = ws_state.broadcast_msg(&DaemonMsg::Heartbeat {
                                    daemon_id: "IceDaemon".to_string(),
                                    state: DaemonState::Alert,
                                    timestamp: Utc::now(),
                                });

                                let _ = ws_state.broadcast_msg(&DaemonMsg::IceResponse {
                                    target_ip: host.ip.to_string(),
                                    action: "QUARANTINE_TRIGGERED".to_string(),
                                    reason: format!("Anomaly score {:.2} exceeds critical threshold of {:.2}", host.anomaly_score, threshold),
                                    timestamp: Utc::now(),
                                });

                                let mut updated = host.clone();
                                updated.is_quarantined = true;
                                updated.ice_integrity = 0.0;
                                engine.update_host(updated);
                            }
                        }
                    }
                }
            }
        })
    }
}
