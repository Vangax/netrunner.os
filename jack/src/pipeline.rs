use tokio::sync::mpsc;
use protocol::net::NetPacket;
use crate::capture::AsyncCapture;
use tracing::{info, error, warn};

pub async fn run_pipeline(
    mut capture: AsyncCapture,
    tx: mpsc::Sender<NetPacket>,
    mut shutdown: tokio::sync::broadcast::Receiver<()>,
) {
    info!("NEURAL LINK ESTABLISHED. SYNAPSE FIREWALL BYPASSED.");
    
    loop {
        tokio::select! {
            _ = shutdown.recv() => {
                info!("Shutdown signal received. Stopping packet pipeline.");
                break;
            }
            should_break = async {
                tokio::task::yield_now().await;
                if let Some(pkt) = capture.next_packet() {
                    match tx.try_send(pkt) {
                        Ok(()) => {}
                        Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {
                            warn!("Packet pipeline full, dropping packet");
                        }
                        Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => {
                            error!("Packet pipeline closed, shutting down capture");
                            return true;
                        }
                    }
                }
                false
            } => {
                if should_break {
                    break;
                }
            }
        }
    }
}
