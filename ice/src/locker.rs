use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;
use aes_gcm::{Aes256Gcm, Key, Nonce, KeyInit};
use aes_gcm::aead::Aead;
use rand::Rng;
use rand::SeedableRng;
use protocol::breach::BreachGrid;
use zeroize::Zeroize;

#[derive(Clone)]
pub struct ActiveBreachSession {
    pub seed: [u8; 32],
    pub correct_path: Vec<String>,
    pub salt: [u8; 32],
    pub ciphertext: Vec<u8>,
    pub iv: [u8; 12],
    pub original_pcap_hex: String,
}

pub struct EvidenceLocker;

impl EvidenceLocker {
    pub fn generate_deterministic_game(seed: [u8; 32]) -> (BreachGrid, Vec<String>) {
        let options = vec!["1C", "E9", "55", "7A", "BD", "FF"];
        let mut rng = rand::rngs::StdRng::from_seed(seed);
        
        let mut matrix = vec![vec!["".to_string(); 6]; 6];
        for r in 0..6 {
            for c in 0..6 {
                let idx = rng.gen_range(0..options.len());
                matrix[r][c] = options[idx].to_string();
            }
        }

        let c0 = rng.gen_range(0..6);
        let val0 = matrix[0][c0].clone();

        let mut r1 = rng.gen_range(0..6);
        while r1 == 0 {
            r1 = rng.gen_range(0..6);
        }
        let val1 = matrix[r1][c0].clone();

        let mut c2 = rng.gen_range(0..6);
        while c2 == c0 {
            c2 = rng.gen_range(0..6);
        }
        let val2 = matrix[r1][c2].clone();

        let mut r3 = rng.gen_range(0..6);
        while r3 == r1 {
            r3 = rng.gen_range(0..6);
        }
        let val3 = matrix[r3][c2].clone();

        let correct_path = vec![val0, val1, val2, val3];

        let targets = vec![
            vec![correct_path[0].clone(), correct_path[1].clone()],
            vec![correct_path[2].clone(), correct_path[3].clone()],
        ];

        let grid = BreachGrid {
            matrix,
            targets,
            buffer_size: 4,
        };

        (grid, correct_path)
    }

    pub fn encrypt_evidence(
        password: &str,
        session_salt: &[u8; 32],
        plaintext: &[u8],
    ) -> anyhow::Result<(Vec<u8>, [u8; 12])> {
        let mut derived_key = [0u8; 32];
        pbkdf2_hmac::<Sha256>(
            password.as_bytes(),
            session_salt,
            100_000,
            &mut derived_key,
        );

        let key = Key::<Aes256Gcm>::from_slice(&derived_key);
        let cipher = Aes256Gcm::new(key);

        let mut rng = rand::thread_rng();
        let mut iv = [0u8; 12];
        rng.fill(&mut iv);
        let nonce = Nonce::from_slice(&iv);

        let ciphertext = cipher.encrypt(nonce, plaintext)
            .map_err(|e| anyhow::anyhow!("Encryption failed: {:?}", e))?;

        derived_key.zeroize();

        Ok((ciphertext, iv))
    }

    pub fn decrypt_evidence(
        password: &str,
        session_salt: &[u8; 32],
        ciphertext: &[u8],
        iv: &[u8; 12],
    ) -> anyhow::Result<Vec<u8>> {
        let mut derived_key = [0u8; 32];
        pbkdf2_hmac::<Sha256>(
            password.as_bytes(),
            session_salt,
            100_000,
            &mut derived_key,
        );

        let key = Key::<Aes256Gcm>::from_slice(&derived_key);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(iv);

        let decrypted = cipher.decrypt(nonce, ciphertext)
            .map_err(|e| anyhow::anyhow!("Decryption failed: {:?}", e))?;

        derived_key.zeroize();

        Ok(decrypted)
    }
}
