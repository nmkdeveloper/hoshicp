pub mod checker;
pub mod commands;
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
        .manage(crate::commands::StressState::default())
        .invoke_handler(tauri::generate_handler![
            crate::commands::compile_and_run,
            crate::commands::compile_source,
            crate::commands::run_testcase,
            crate::commands::run_all_testcases,
            crate::commands::run_stress_test,
            crate::commands::cancel_stress_test,
            crate::commands::start_lsp_server,
            crate::commands::format_source_code,
            crate::commands::save_sidecar_file,
            crate::commands::load_sidecar_file,
            crate::commands::window_close,
            crate::commands::window_minimize,
            crate::commands::window_toggle_maximize,
            crate::commands::window_start_dragging,
            crate::commands::dialog_open_code_file,
            crate::commands::dialog_save_code_file,
            crate::commands::dialog_open_testcase_file,
            crate::commands::dialog_open_testcase_files,
            crate::commands::dialog_save_testcase_file,
            crate::commands::write_file_to_path,
            crate::commands::get_system_fonts,
            crate::updater::check_for_updates,
            crate::updater::download_and_install_update,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) =
                    crate::server::companion::start_companion_server(handle, 10043, 10045).await
                {
                    eprintln!("Failed to start companion server: {}", e);
                }
            });
            crate::updater::spawn_startup_update_checker(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
