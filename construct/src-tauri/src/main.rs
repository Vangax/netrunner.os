#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;
use std::sync::Mutex;

#[tauri::command]
fn get_netos_banner() -> String {
    "ARASAKA NEURAL NET/OS v1.0 ONLINE".to_string()
}

#[tauri::command]
fn get_uptime(state: tauri::State<'_, AppUptime>) -> u64 {
    state.start_time.elapsed().as_secs()
}

struct AppUptime {
    start_time: std::time::Instant,
}

fn main() {
    let _mutex = match single_instance_guard() {
        Some(m) => m,
        None => {
            eprintln!("NET/OS is already running. Exiting duplicate instance.");
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .manage(AppUptime {
            start_time: std::time::Instant::now(),
        })
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            window.set_fullscreen(true).unwrap();
            window.set_resizable(false).unwrap();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_netos_banner, get_uptime])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn single_instance_guard() -> Option<()> {
    use std::ffi::CString;
    let lock_path = std::env::temp_dir().join("netos_v1_instance.lock");
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
    {
        Ok(_) => {
            let path = lock_path.clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                }
            });
            ctrlc_cleanup(lock_path);
            Some(())
        }
        Err(_) => {
            if let Ok(metadata) = std::fs::metadata(&lock_path) {
                if let Ok(modified) = metadata.modified() {
                    if modified.elapsed().unwrap_or_default() > std::time::Duration::from_secs(60) {
                        let _ = std::fs::remove_file(&lock_path);
                        return single_instance_guard();
                    }
                }
            }
            None
        }
    }
}

fn ctrlc_cleanup(lock_path: std::path::PathBuf) {
    let _ = std::panic::catch_unwind(|| {
        let _path = lock_path;
    });
}
