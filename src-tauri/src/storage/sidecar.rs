use std::fs;
use std::path::{Path, PathBuf};
use crate::error::AppError;
use crate::models::SidecarData;

/// Computes the primary sidecar path for a given source code file (<source_stem>.hoshicp.json).
pub fn sidecar_path(source_path: &Path) -> PathBuf {
    let stem = source_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("solution");
    source_path.with_file_name(format!("{}.hoshicp.json", stem))
}

/// Returns the existing sidecar path if either <source_stem>.hoshicp.json or
/// <source_file>.hoshicp.json exists, defaulting to <source_stem>.hoshicp.json.
pub fn resolve_sidecar_path(source_path: &Path) -> PathBuf {
    if let Some(file_name) = source_path.file_name().and_then(|s| s.to_str()) {
        if file_name.ends_with(".hoshicp.json") {
            return source_path.to_path_buf();
        }
    }

    let primary = sidecar_path(source_path);
    if primary.exists() {
        return primary;
    }

    if let Some(filename) = source_path.file_name().and_then(|s| s.to_str()) {
        let alt = source_path.with_file_name(format!("{}.hoshicp.json", filename));
        if alt.exists() {
            return alt;
        }
    }

    primary
}

/// Saves the sidecar data into JSON format alongside the source file.
pub fn save_sidecar(source_path: &Path, data: &SidecarData) -> Result<(), AppError> {
    let path = resolve_sidecar_path(source_path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    let json_bytes = serde_json::to_vec_pretty(data)?;
    fs::write(&path, json_bytes)?;
    Ok(())
}

/// Loads sidecar data from the JSON file alongside the source file.
pub fn load_sidecar(source_path: &Path) -> Result<SidecarData, AppError> {
    let path = resolve_sidecar_path(source_path);
    if !path.exists() {
        return Err(AppError::Generic(format!(
            "Sidecar file not found: {}",
            path.display()
        )));
    }
    let content = fs::read_to_string(&path)?;
    let data: SidecarData = serde_json::from_str(&content)?;
    Ok(data)
}
