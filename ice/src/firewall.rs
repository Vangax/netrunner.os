use std::process::Command;
use tracing::{info, error};

pub struct FirewallEngine;

impl FirewallEngine {
    pub fn new() -> Self {
        Self
    }

    pub async fn get_rules(&self) -> anyhow::Result<String> {
        tokio::task::spawn_blocking(|| {
            let output = Command::new("cmd")
                .args(["/C", "netsh advfirewall firewall show rule name=all"])
                .output()?;
            let text = String::from_utf8_lossy(&output.stdout).to_string();
            Ok(text)
        }).await?
    }

    pub async fn quarantine_host(&self, ip: &str) -> anyhow::Result<()> {
        let ip_string = ip.to_string();
        info!("DEPLOYING FIREWALL ICE BLOCK ON TARGET: {}", ip_string);
        
        tokio::task::spawn_blocking(move || {
            let rule_name = format!("NETOS_QUARANTINE_{}", ip_string);
            let output = Command::new("cmd")
                .args([
                    "/C",
                    &format!(
                        "netsh advfirewall firewall add rule name=\"{}\" dir=in action=block remoteip={}",
                        rule_name, ip_string
                    )
                ])
                .output()?;

            if !output.status.success() {
                let err_msg = String::from_utf8_lossy(&output.stderr);
                error!("Failed to execute netsh quarantine rule command: {}", err_msg);
                return Err(anyhow::anyhow!("Firewall rule addition failed: {}", err_msg));
            }
            info!("FIREWALL BLOCK INJECTED: Host {} isolated.", ip_string);
            Ok(())
        }).await?
    }

    pub async fn remove_quarantine_host(&self, ip: &str) -> anyhow::Result<()> {
        let ip_string = ip.to_string();
        info!("REMOVING FIREWALL ICE BLOCK ON TARGET: {}", ip_string);

        tokio::task::spawn_blocking(move || {
            let rule_name = format!("NETOS_QUARANTINE_{}", ip_string);
            let output = Command::new("cmd")
                .args([
                    "/C",
                    &format!("netsh advfirewall firewall delete rule name=\"{}\"", rule_name)
                ])
                .output()?;

            if !output.status.success() {
                let err_msg = String::from_utf8_lossy(&output.stderr);
                error!("Failed to execute netsh delete rule command: {}", err_msg);
                return Err(anyhow::anyhow!("Firewall rule deletion failed: {}", err_msg));
            }
            info!("FIREWALL BLOCK REMOVED: Host {} restored to connection matrix.", ip_string);
            Ok(())
        }).await?
    }
}
