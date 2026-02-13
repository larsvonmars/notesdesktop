use tauri::App;

#[cfg(mobile)]
mod mobile;
#[cfg(mobile)]
pub use mobile::*;

/// Shared app setup logic used by both desktop and mobile entry points.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|_app: &mut App| {
            // Shared setup logic goes here
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
