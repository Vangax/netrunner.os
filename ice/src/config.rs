use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub neo4j_uri: String,
    pub neo4j_user: String,
    pub neo4j_pass: String,
    pub redis_uri: String,
    pub http_port: u16,
    pub llama_server_url: String,
    pub suricata_eve_path: String,
    pub anomaly_threshold: f64,
}

impl Config {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        Self {
            neo4j_uri: env::var("NEO4J_URI").unwrap_or_else(|_| "bolt://localhost:7687".to_string()),
            neo4j_user: env::var("NEO4J_USER").unwrap_or_else(|_| "neo4j".to_string()),
            neo4j_pass: env::var("NEO4J_PASS").unwrap_or_else(|_| "password".to_string()),
            redis_uri: env::var("REDIS_URI").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string()),
            http_port: env::var("HTTP_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8000),
            llama_server_url: env::var("LLAMA_SERVER_URL")
                .unwrap_or_else(|_| "http://localhost:8080".to_string()),
            suricata_eve_path: env::var("SURICATA_EVE_PATH")
                .unwrap_or_else(|_| r"C:\Suricata\log\eve.json".to_string()),
            anomaly_threshold: env::var("ANOMALY_THRESHOLD")
                .ok()
                .and_then(|t| t.parse().ok())
                .unwrap_or(3.5),
        }
    }
}
