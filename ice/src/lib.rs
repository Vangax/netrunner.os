pub mod config;
pub mod engine;
pub mod topology;
pub mod monitor;
pub mod firewall;
pub mod quarantine;
pub mod response;
pub mod locker;
pub mod audit;
pub mod flatline;
pub mod ws;
pub mod daemon;

use std::sync::Arc;

pub struct AppState {
    pub engine: Arc<engine::Engine>,
    pub firewall: Arc<firewall::FirewallEngine>,
    pub ws_state: Arc<ws::WsState>,
    pub active_sessions: Arc<std::sync::Mutex<std::collections::HashMap<String, locker::ActiveBreachSession>>>,
}
