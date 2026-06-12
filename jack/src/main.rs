use tokio::sync::{mpsc, broadcast};
use jack::capture::{select_default_interface, AsyncCapture};
use jack::pipeline::run_pipeline;
use jack::etw::start_etw_telemetry;
use tracing::{info, error, Level};
use tracing_subscriber::FmtSubscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .json()
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    let device = select_default_interface()?;
    info!("Selected default capture interface: {}", device.name);

    let capture = AsyncCapture::new(device)?;
    let (tx, mut rx) = mpsc::channel(10000);
    let (shutdown_tx, shutdown_rx) = broadcast::channel(1);

    start_etw_telemetry();

    let pipeline_handle = tokio::spawn(async move {
        run_pipeline(capture, tx, shutdown_rx).await;
    });

    let ws_handle = tokio::spawn(async move {
        let client = reqwest::Client::new();
        let ingest_url = "http://127.0.0.1:8000/ingest";

        while let Some(pkt) = rx.recv().await {
            info!(
                "Packet: {} -> {} | Proto: {} | Size: {} bytes",
                pkt.src_ip, pkt.dst_ip, pkt.protocol, pkt.size
            );

            match client.post(ingest_url).json(&pkt).send().await {
                Ok(resp) => {
                    if !resp.status().is_success() {
                        error!("Failed to POST packet to /ingest: {:?}", resp.status());
                    }
                }
                Err(e) => {
                    error!("Failed to send packet HTTP POST to ICE: {:?}", e);
                }
            }
        }
    });

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("Ctrl+C detected. Shutting down.");
            let _ = shutdown_tx.send(());
        }
    }

    let _ = pipeline_handle.await;
    drop(ws_handle);

    Ok(())
}
