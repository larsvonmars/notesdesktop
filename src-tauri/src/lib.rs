use tauri::App;

mod ai_command;

#[cfg(mobile)]
mod mobile;
#[cfg(mobile)]
pub use mobile::*;

/// Shared app setup logic used by both desktop and mobile entry points.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            ai_command::ai_chat_json,
            ai_command::ai_key_status,
            ai_command::ai_set_api_key,
            ai_command::ai_clear_api_key,
        ])
        .setup(|_app: &mut App| {
            // Shared setup logic goes here
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
