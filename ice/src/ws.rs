use tokio::sync::broadcast;
use axum::{
    extract::{ws::{WebSocket, Message}, WebSocketUpgrade, State},
    response::IntoResponse,
};
use rmp_serde::to_vec_named;
use protocol::daemon::DaemonMsg;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, error};
use futures_util::StreamExt;

pub struct WsState {
    pub broadcast_tx: broadcast::Sender<Vec<u8>>,
}

impl WsState {
    pub fn new() -> Self {
        let (broadcast_tx, _) = broadcast::channel(1024);
        Self { broadcast_tx }
    }

    pub fn broadcast_msg(&self, msg: &DaemonMsg) -> anyhow::Result<()> {
        let serialized = to_vec_named(msg)?;
        let _ = self.broadcast_tx.send(serialized);
        Ok(())
    }
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<crate::AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_websocket(socket, state))
}

async fn handle_websocket(socket: WebSocket, app_state: Arc<crate::AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = app_state.ws_state.broadcast_tx.subscribe();

    let send_task = tokio::spawn(async move {
        use futures_util::SinkExt;
        while let Ok(msg_bytes) = rx.recv().await {
            if let Err(e) = sender.send(Message::Binary(msg_bytes)).await {
                error!("WebSocket write error: {:?}", e);
                break;
            }
        }
    });

    let engine_clone = app_state.engine.clone();
    let recv_task = tokio::spawn(async move {
        use futures_util::StreamExt;
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Binary(bytes) => {
                    if let Ok(pkt) = rmp_serde::from_slice::<protocol::net::NetPacket>(&bytes) {
                        engine_clone.ingest_packet(pkt);
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }
    info!("WebSocket client disconnected.");
}
