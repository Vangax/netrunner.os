use zeroize::Zeroize;
use tracing::info;

pub struct FlatlineController {
    active_keys: Vec<[u8; 32]>,
}

impl FlatlineController {
    pub fn new() -> Self {
        Self {
            active_keys: Vec::new(),
        }
    }

    pub fn register_key(&mut self, mut key: [u8; 32]) {
        self.active_keys.push(key);
    }

    pub fn trigger_flatline(&mut self) {
        info!("NEURAL LINK SEVERED. CONSTRUCT LOST. Executing memory wipe.");
        
        for key in &mut self.active_keys {
            key.zeroize();
        }
        self.active_keys.clear();
        
        info!("All active cryptographic keys zeroized successfully.");
    }
}
