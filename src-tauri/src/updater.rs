use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReleaseManifestPlatform {
    pub signature: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReleaseManifest {
    pub version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    pub platforms: HashMap<String, ReleaseManifestPlatform>,
}

/// Formats a cute Hoshino-themed prompt dialog string for update notifications.
pub fn format_hoshino_update_dialog(info: &UpdateInfo) -> String {
    if let Some(version) = &info.version {
        let notes = info
            .body
            .as_deref()
            .unwrap_or("Performance improvements and bug fixes.");
        format!(
            "Uhe~ Sensei! A new version of HoshiCP (v{}) is ready!\n\nRelease Notes:\n{}\n\nWould you like Hoshino to take a quick nap while we update?",
            version, notes
        )
    } else {
        "Uhe~ HoshiCP is already running the latest version, Sensei.".to_string()
    }
}

/// Parses and validates a Tauri v2 auto-updater release manifest (`latest.json`).
pub fn parse_release_manifest(json_str: &str) -> Result<ReleaseManifest, String> {
    serde_json::from_str(json_str).map_err(|e| format!("Failed to parse release manifest: {e}"))
}

/// Validates that the parsed release manifest contains required fields and valid platforms.
pub fn validate_release_manifest(manifest: &ReleaseManifest) -> Result<(), String> {
    if manifest.version.trim().is_empty() {
        return Err("Manifest version cannot be empty".to_string());
    }
    if manifest.platforms.is_empty() {
        return Err("Manifest must provide at least one platform target".to_string());
    }
    for (platform, target) in &manifest.platforms {
        if target.url.trim().is_empty() {
            return Err(format!("Platform {platform} must have a valid download URL"));
        }
        if target.signature.trim().is_empty() {
            return Err(format!("Platform {platform} must have a valid signature"));
        }
    }
    Ok(())
}

/// Tauri command: Checks for available updates using the configured updater plugin.
#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    let updater = app
        .updater()
        .map_err(|e| format!("Failed to initialize updater: {e}"))?;

    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateInfo {
            available: true,
            current_version: update.current_version.clone(),
            version: Some(update.version.clone()),
            body: update.body.clone(),
            date: update.date.map(|d| d.to_string()),
        }),
        Ok(None) => Ok(UpdateInfo {
            available: false,
            current_version: app.package_info().version.to_string(),
            version: None,
            body: None,
            date: None,
        }),
        Err(e) => Err(format!("Failed to check for updates: {e}")),
    }
}

/// Tauri command: Downloads and installs available update package.
#[tauri::command]
pub async fn download_and_install_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|e| format!("Failed to initialize updater: {e}"))?;

    if let Some(update) = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for updates: {e}"))?
    {
        update
            .download_and_install(|_downloaded, _total| {}, || {})
            .await
            .map_err(|e| format!("Failed to download and install update: {e}"))?;
        Ok(())
    } else {
        Err("No update available to install".to_string())
    }
}

/// Spawns background task after application startup to check for updates and emit event.
pub fn spawn_startup_update_checker(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
        if let Ok(info) = check_for_updates(handle.clone()).await {
            if info.available {
                use tauri::Emitter;
                let _ = handle.emit("hoshi-update-available", &info);
            }
        }
    });
}
