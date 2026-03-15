/// Mobile entry point — called by the Tauri runtime on iOS / Android.
#[tauri::mobile_entry_point]
pub fn mobile_main() {
    crate::run();
}
