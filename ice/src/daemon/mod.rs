pub mod recon;
pub mod construct;
pub mod ice;
pub mod ghost;

use recon::ReconDaemon;
use construct::ConstructDaemon;
use ice::IceDaemon;
use ghost::GhostDaemon;

use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{info, error};

pub struct DaemonSupervisor {
    ws_state: Arc<crate::ws::WsState>,
    engine: Arc<crate::engine::Engine>,
    config: crate::config::Config,
}

impl DaemonSupervisor {
    pub fn new(
        ws_state: Arc<crate::ws::WsState>,
        engine: Arc<crate::engine::Engine>,
        config: crate::config::Config,
    ) -> Self {
        Self { ws_state, engine, config }
    }

    pub fn start(&self, mut shutdown: broadcast::Receiver<()>) {
        let ws_state = self.ws_state.clone();
        let engine = self.engine.clone();
        let config = self.config.clone();

        tokio::spawn(async move {
            info!("Initializing Cyberware Daemon Supervisor...");

            let recon_handle = ReconDaemon::start(ws_state.clone(), engine.clone(), shutdown.resubscribe());
            let construct_handle = ConstructDaemon::start(ws_state.clone(), engine.clone(), config.llama_server_url.clone(), shutdown.resubscribe());
            let ice_handle = IceDaemon::start(ws_state.clone(), engine.clone(), config.anomaly_threshold, shutdown.resubscribe());
            let ghost_handle = GhostDaemon::start(ws_state.clone(), shutdown.resubscribe());

            tokio::select! {
                _ = shutdown.recv() => {
                    info!("Daemon supervisor received shutdown signal.");
                }
            }

            let _ = tokio::join!(recon_handle, construct_handle, ice_handle, ghost_handle);
            info!("All defense daemons flatlined.");
        });
    }
}
