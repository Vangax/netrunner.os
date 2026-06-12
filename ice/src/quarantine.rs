use crate::firewall::FirewallEngine;
use crate::audit::AuditLogger;
use tracing::{info, error};
use std::sync::Arc;

pub struct QuarantineManager {
    firewall: Arc<FirewallEngine>,
    audit: Arc<AuditLogger>,
}

impl QuarantineManager {
    pub fn new(firewall: Arc<FirewallEngine>, audit: Arc<AuditLogger>) -> Self {
        Self { firewall, audit }
    }

    pub async fn quarantine(&self, ip: &str, reason: &str) -> anyhow::Result<()> {
        info!("QUARANTINE ENFORCED on host {} for reason: {}", ip, reason);
        self.firewall.quarantine_host(ip).await?;
        self.audit.log_action("QUARANTINE", ip, reason).await?;
        Ok(())
    }

    pub async fn lift_quarantine(&self, ip: &str, reason: &str) -> anyhow::Result<()> {
        info!("LIFTING QUARANTINE on host {} for reason: {}", ip, reason);
        self.firewall.remove_quarantine_host(ip).await?;
        self.audit.log_action("LIFT_QUARANTINE", ip, reason).await?;
        Ok(())
    }
}
