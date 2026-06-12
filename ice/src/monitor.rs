use tokio::fs::File;
use tokio::io::{AsyncBufReadExt, BufReader};
use std::path::Path;
use std::time::Duration;
use tracing::{info, error, warn};
use crate::firewall::FirewallEngine;
use crate::engine::Engine;
use std::sync::Arc;
use serde_json::Value;

pub struct LogMonitor {
    eve_path: String,
    engine: Arc<Engine>,
    firewall: Arc<FirewallEngine>,
}

impl LogMonitor {
    pub fn new(eve_path: String, engine: Arc<Engine>, firewall: Arc<FirewallEngine>) -> Self {
        Self { eve_path, engine, firewall }
    }

    pub fn start(&self, mut shutdown: tokio::sync::broadcast::Receiver<()>) {
        let eve_path = self.eve_path.clone();
        let engine = self.engine.clone();
        let firewall = self.firewall.clone();

        tokio::spawn(async move {
            let mut backoff = Duration::from_secs(1);
            loop {
                tokio::select! {
                    _ = shutdown.recv() => {
                        info!("Shutting down Suricata log monitor.");
                        break;
                    }
                    _ = async {
                        let path = Path::new(&eve_path);
                        if !path.exists() {
                            tokio::time::sleep(backoff).await;
                            backoff = (backoff * 2).min(Duration::from_secs(30));
                            return;
                        }
                        backoff = Duration::from_secs(1);

                        let file = match File::open(&eve_path).await {
                            Ok(f) => f,
                            Err(e) => {
                                error!("Failed to open Suricata log file: {:?}", e);
                                tokio::time::sleep(Duration::from_secs(2)).await;
                                return;
                            }
                        };

                        let mut reader = BufReader::new(file);
                        if let Err(e) = reader.seek_to_end().await {
                            warn!("Failed to seek Suricata EVE log reader: {:?}", e);
                        }

                        let mut line = String::new();
                        loop {
                            line.clear();
                            match reader.read_line(&mut line).await {
                                Ok(0) => {
                                    tokio::time::sleep(Duration::from_millis(100)).await;
                                }
                                Ok(_) => {
                                    if let Err(e) = Self::process_alert_line(&line, &engine, &firewall).await {
                                        error!("Failed processing Suricata alert line: {:?}", e);
                                    }
                                }
                                Err(e) => {
                                    error!("Read error on Suricata EVE log: {:?}", e);
                                    break;
                                }
                            }
                        }
                    } => {}
                }
            }
        });
    }

    async fn process_alert_line(line: &str, engine: &Engine, firewall: &FirewallEngine) -> anyhow::Result<()> {
        let val: Value = serde_json::from_str(line)?;
        if let Some(event_type) = val.get("event_type").and_then(|v| v.as_str()) {
            if event_type == "alert" {
                if let Some(alert) = val.get("alert") {
                    let severity = alert.get("severity").and_then(|s| s.as_u64()).unwrap_or(3);
                    let src_ip = val.get("src_ip").and_then(|s| s.as_str()).unwrap_or("");
                    let signature = alert.get("signature").and_then(|s| s.as_str()).unwrap_or("Unknown signature");

                    if !src_ip.is_empty() {
                        if let Some(mut host) = engine.get_host(src_ip) {
                            let drop = match severity {
                                1 => 40.0,
                                2 => 20.0,
                                _ => 5.0,
                            };
                            host.ice_integrity = (host.ice_integrity - drop).max(0.0);
                            engine.update_host(host.clone());

                            info!(
                                "ALERT: [Host: {}] [Sig: {}] - ICE Integrity dropped to {}",
                                src_ip, signature, host.ice_integrity
                            );

                            if host.ice_integrity <= 0.0 && !host.is_quarantined {
                                info!("ICE INTEGRITY CRITICAL FOR HOST {}. Initiating quarantine.", src_ip);
                                if let Err(e) = firewall.quarantine_host(src_ip).await {
                                    error!("Failed autonomous quarantine for host {}: {:?}", src_ip, e);
                                } else {
                                    host.is_quarantined = true;
                                    engine.update_host(host);
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }
}

trait SeekToEnd {
    async fn seek_to_end(&mut self) -> std::io::Result<u64>;
}

impl SeekToEnd for BufReader<File> {
    async fn seek_to_end(&mut self) -> std::io::Result<u64> {
        use tokio::io::AsyncSeekExt;
        self.seek(std::io::SeekFrom::End(0)).await
    }
}
