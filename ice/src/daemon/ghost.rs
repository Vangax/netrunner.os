use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::time::{sleep, Duration, timeout};
use tracing::{info, error, warn};
use protocol::daemon::{DaemonMsg, DaemonState};
use crate::ws::WsState;
use chrono::Utc;
use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub struct GhostDaemon;

impl GhostDaemon {
    pub fn start(
        ws_state: Arc<WsState>,
        mut shutdown: broadcast::Receiver<()>,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            info!("GhostDaemon camouflage grid active: binding TCP honeypot port 5555...");
            
            let listener = match TcpListener::bind("0.0.0.0:5555").await {
                Ok(l) => {
                    info!("GhostDaemon Decoy Honeypot listening on TCP port 5555");
                    Some(l)
                }
                Err(e) => {
                    error!("GhostDaemon failed to bind honeypot TCP port 5555: {:?}", e);
                    None
                }
            };

            let ws_clone = ws_state.clone();
            
            if let Some(listener) = listener {
                tokio::spawn(async move {
                    loop {
                        match listener.accept().await {
                            Ok((stream, _)) => {
                                let ws = ws_clone.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_decoy_connection(stream, ws).await {
                                        warn!("Error handling decoy connection: {:?}", e);
                                    }
                                });
                            }
                            Err(e) => {
                                warn!("Failed to accept decoy connection: {:?}", e);
                                sleep(Duration::from_millis(500)).await;
                            }
                        }
                    }
                });
            }

            let mut interval = tokio::time::interval(Duration::from_secs(10));
            loop {
                tokio::select! {
                    _ = shutdown.recv() => {
                        let _ = ws_state.broadcast_msg(&DaemonMsg::Heartbeat {
                            daemon_id: "GhostDaemon".to_string(),
                            state: DaemonState::Stopped,
                            timestamp: Utc::now(),
                        });
                        break;
                    }
                    _ = interval.tick() => {
                        let _ = ws_state.broadcast_msg(&DaemonMsg::Heartbeat {
                            daemon_id: "GhostDaemon".to_string(),
                            state: DaemonState::Running,
                            timestamp: Utc::now(),
                        });
                    }
                }
            }
        })
    }
}

async fn handle_decoy_connection(mut stream: TcpStream, ws_state: Arc<WsState>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let peer_addr = stream.peer_addr()?.ip().to_string();
    info!("DECOY TARGET HIT: Connection established from peer address: {}", peer_addr);

    let _ = ws_state.broadcast_msg(&DaemonMsg::GhostDeception {
        deception_type: "FAKE_PORT_HIT".to_string(),
        details: format!("Honeypot Decoy Hit: Connection established from host IP {}", peer_addr),
        timestamp: Utc::now(),
    });

    let banner = "============================================================\n\
                  ARASAKA DATA BRIDGE NETRUNNER TERMINAL v9.44-SECURE\n\
                  ============================================================\n\
                  WARNING: Unauthorized connections will be logged by NetWatch.\n\
                  Neural synchronization handshake: active.\n\n\
                  Login User ID: ";
    
    stream.write_all(banner.as_bytes()).await?;
    
    let mut buffer = [0u8; 512];
    let mut interactions = 0;

    while interactions < 3 {
        match timeout(Duration::from_secs(30), stream.read(&mut buffer)).await {
            Ok(Ok(0)) => break,
            Ok(Ok(n)) => {
                let input = String::from_utf8_lossy(&buffer[..n]).trim().to_string();
                if input.is_empty() {
                    continue;
                }

                if input.to_lowercase() == "exit" || input.to_lowercase() == "quit" {
                    stream.write_all(b"\nSession closed by peer. Purging neural buffer.\n").await?;
                    break;
                }

                let reply = query_ollama_decoy(&input).await.unwrap_or_else(|_| {
                    if input.contains("admin") || input.contains("root") {
                        "ACCESS RESTRICTED: Level 5 credentials required. Counter-audit engaged.".to_string()
                    } else if input.contains("help") || input.contains("?") {
                        "Available subsystems: [core_auth, subgrid_link, database_relay].".to_string()
                    } else {
                        format!("ACCESS DENIED: Authentication vector '{}' rejected. Decoy buffer engaged.", input)
                    }
                });

                let _ = ws_state.broadcast_msg(&DaemonMsg::GhostDeception {
                    deception_type: "HONEYPOT_ALERT".to_string(),
                    details: format!("Intruder [{}] entered: '{}' | Decoy AI replied: '{}'", peer_addr, input, reply),
                    timestamp: Utc::now(),
                });

                let formatted_reply = format!("\n{} \n\nEnter password / Command: ", reply);
                stream.write_all(formatted_reply.as_bytes()).await?;
                interactions += 1;
            }
            Ok(Err(e)) => return Err(Box::new(e)),
            Err(_) => {
                let _ = stream.write_all(b"\nConnection timeout. Severing link.\n").await;
                break;
            }
        }
    }

    let _ = stream.write_all(b"\nMAX DIAL-IN LIMIT EXCEEDED. COGNITIVE DECOY DISCONNECTING PEER.\n").await;
    Ok(())
}

async fn query_ollama_decoy(prompt: &str) -> anyhow::Result<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(900))
        .build()?;

    let res = client.post("http://localhost:11434/api/generate")
        .json(&serde_json::json!({
            "model": "llama3",
            "prompt": format!(
                "You are an active, secure Cyberpunk database mainframe terminal. The user entered this input: '{}'. \
                 Respond to their input as an automated terminal security daemon would (e.g. denying access, warning of logs, or outputting fake directory listings). \
                 Keep your response under 90 characters. Do not include conversational remarks or explanations outside the system output itself.", 
                prompt
            ),
            "stream": false
        }))
        .send()
        .await?;

    let body: serde_json::Value = res.json().await?;
    if let Some(resp) = body.get("response") {
        if let Some(s) = resp.as_str() {
            return Ok(s.trim().to_string());
        }
    }

    Err(anyhow::anyhow!("Ollama response empty"))
}
