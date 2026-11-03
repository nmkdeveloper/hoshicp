pub mod checker;
pub mod error;
pub mod formatter;
pub mod lsp;
pub mod models;
pub mod runner;
pub mod server;
pub mod storage;
pub mod stress;
pub mod updater;

pub use error::AppError;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            crate::updater::check_for_updates,
            crate::updater::download_and_install_update,
        ])
        .setup(|app| {
            crate::updater::spawn_startup_update_checker(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
