use tokio::fs::OpenOptions;
use tokio::io::AsyncWriteExt;
use serde_json::json;
use chrono::Utc;
use sha2::{Sha256, Digest};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::path::Path;

pub struct AuditLogger {
    log_path: String,
    last_hash: Arc<Mutex<String>>,
}

impl AuditLogger {
    pub async fn new(log_path: &str) -> anyhow::Result<Self> {
        let path = Path::new(log_path);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let mut last_hash = vec![0u8; 32];
        if path.exists() {
            let content = tokio::fs::read_to_string(path).await.unwrap_or_default();
            if let Some(last_line) = content.lines().last() {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(last_line) {
                    if let Some(h) = val.get("hash").and_then(|h| h.as_str()) {
                        if let Ok(decoded) = hex::decode(h) {
                            last_hash = decoded;
                        }
                    }
                }
            }
        }

        Ok(Self {
            log_path: log_path.to_string(),
            last_hash: Arc::new(Mutex::new(hex::encode(last_hash))),
        })
    }

    pub async fn log_action(&self, action: &str, target_ip: &str, details: &str) -> anyhow::Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
            .await?;

        let timestamp = Utc::now().to_rfc3339();
        let mut last_hash_guard = self.last_hash.lock().await;

        let mut payload = json!({
            "action": action,
            "target_ip": target_ip,
            "details": details,
            "timestamp": timestamp,
            "prev_hash": *last_hash_guard
        });

        let payload_str = serde_json::to_string(&payload)?;
        let mut hasher = Sha256::new();
        hasher.update(payload_str.as_bytes());
        let current_hash = hex::encode(hasher.finalize());

        if let Some(obj) = payload.as_object_mut() {
            obj.insert("hash".to_string(), json!(current_hash));
        }

        let serialized_line = format!("{}\n", serde_json::to_string(&payload)?);
        file.write_all(serialized_line.as_bytes()).await?;

        *last_hash_guard = current_hash;

        Ok(())
    }
}
