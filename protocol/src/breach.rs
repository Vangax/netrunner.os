use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreachGrid {
    pub matrix: Vec<Vec<String>>, // 6x6 grid of hex pairs e.g. "E9", "1C", "55", "FF"
    pub targets: Vec<Vec<String>>,
    pub buffer_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreachSolution {
    pub grid: BreachGrid,
    pub selected_path: Vec<(usize, usize)>,
    pub was_successful: bool,
    pub session_salt: String,
    pub iv_hex: String,
    pub ciphertext_hex: String,
    pub tag_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvidenceFile {
    pub filename: String,
    pub date_created: String,
    pub size_bytes: usize,
    pub description: String,
    pub is_encrypted: bool,
}
