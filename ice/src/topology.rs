use std::collections::HashMap;
use protocol::net::NetHost;

pub fn calculate_3d_coordinates(hosts: &mut HashMap<String, NetHost>) {
    let keys: Vec<String> = hosts.keys().cloned().collect();
    if keys.is_empty() {
        return;
    }

    let mut rng = rand::thread_rng();
    for key in &keys {
        if let Some(host) = hosts.get_mut(key) {
            if host.coords == [0.0, 0.0, 0.0] {
                use rand::Rng;
                host.coords = [
                    rng.gen_range(-50.0..50.0),
                    rng.gen_range(2.0..25.0),
                    rng.gen_range(-50.0..50.0),
                ];
            }
        }
    }

    let area = 10000.0;
    let k = ((area / keys.len() as f64) as f64).sqrt();
    let iterations = 1; // 1 step per batch update to avoid halting the engine thread

    let mut displacements = HashMap::new();
    for key in &keys {
        displacements.insert(key.clone(), [0.0f32, 0.0f32, 0.0f32]);
    }

    for _ in 0..iterations {
        for i in 0..keys.len() {
            for j in 0..keys.len() {
                if i == j {
                    continue;
                }
                let ip_a = &keys[i];
                let ip_b = &keys[j];

                let (pos_a, pos_b) = {
                    let a = hosts.get(ip_a).unwrap();
                    let b = hosts.get(ip_b).unwrap();
                    (a.coords, b.coords)
                };

                let mut dx = pos_a[0] - pos_b[0];
                let mut dy = pos_a[1] - pos_b[1];
                let mut dz = pos_a[2] - pos_b[2];

                let mut dist = (dx * dx + dy * dy + dz * dz).sqrt();
                if dist < 0.1 {
                    dx = rand::random::<f32>() - 0.5;
                    dy = rand::random::<f32>() - 0.5;
                    dz = rand::random::<f32>() - 0.5;
                    dist = (dx * dx + dy * dy + dz * dz).sqrt();
                }

                let force = (k * k) / dist as f64;
                let disp = displacements.get_mut(ip_a).unwrap();
                disp[0] += ((dx / dist) as f64 * force) as f32;
                disp[1] += ((dy / dist) as f64 * force) as f32;
                disp[2] += ((dz / dist) as f64 * force) as f32;
            }
        }

        let max_displacement = 1.0f32;
        for key in &keys {
            if let Some(host) = hosts.get_mut(key) {
                let disp = displacements.get(key).unwrap();
                let disp_len = (disp[0] * disp[0] + disp[1] * disp[1] + disp[2] * disp[2]).sqrt();
                if disp_len > 0.0 {
                    let scale = disp_len.min(max_displacement) / disp_len;
                    host.coords[0] += disp[0] * scale;
                    host.coords[1] = (host.coords[1] + disp[1] * scale).max(2.0);
                    host.coords[2] += disp[2] * scale;
                }
            }
        }
    }
}
