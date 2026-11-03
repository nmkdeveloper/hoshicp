use hoshicp_lib::updater::{
    format_hoshino_update_dialog, parse_release_manifest, validate_release_manifest,
    ReleaseManifest, ReleaseManifestPlatform, UpdateInfo,
};
use std::collections::HashMap;

#[test]
fn test_tauri_conf_updater_configuration() {
    let conf_str = include_str!("../tauri.conf.json");
    let conf: serde_json::Value = serde_json::from_str(conf_str).expect("Valid JSON");

    let updater_cfg = &conf["plugins"]["updater"];
    assert!(
        updater_cfg.is_object(),
        "tauri.conf.json must contain plugins.updater configuration"
    );

    let endpoints = updater_cfg["endpoints"]
        .as_array()
        .expect("endpoints must be an array");
    assert!(
        endpoints.iter().any(|ep| ep
            .as_str()
            .unwrap_or("")
            .contains("nmkdeveloper/hoshicp/releases/latest/download/latest.json")),
        "endpoints must contain GitHub release latest.json download URL"
    );

    let pubkey = updater_cfg["pubkey"]
        .as_str()
        .expect("pubkey must be configured");
    assert!(!pubkey.is_empty(), "pubkey must not be empty");
}

#[test]
fn test_update_info_serialization_roundtrip() {
    let info = UpdateInfo {
        available: true,
        current_version: "0.1.0".to_string(),
        version: Some("0.2.0".to_string()),
        body: Some("Added testlib checker and auto-updater".to_string()),
        date: Some("2026-11-04T00:00:00Z".to_string()),
    };

    let serialized = serde_json::to_string(&info).expect("Should serialize");
    let deserialized: UpdateInfo = serde_json::from_str(&serialized).expect("Should deserialize");
    assert_eq!(info, deserialized);
}

#[test]
fn test_hoshino_update_dialog_formatting() {
    let update_available = UpdateInfo {
        available: true,
        current_version: "0.1.0".to_string(),
        version: Some("0.2.0".to_string()),
        body: Some("Awesome new features!".to_string()),
        date: None,
    };
    let dialog = format_hoshino_update_dialog(&update_available);
    assert!(dialog.contains("Uhe~ Sensei!"));
    assert!(dialog.contains("v0.2.0"));
    assert!(dialog.contains("Awesome new features!"));

    let update_available_no_body = UpdateInfo {
        available: true,
        current_version: "0.1.0".to_string(),
        version: Some("0.2.0".to_string()),
        body: None,
        date: None,
    };
    let dialog_default = format_hoshino_update_dialog(&update_available_no_body);
    assert!(dialog_default.contains("Performance improvements and bug fixes."));

    let up_to_date = UpdateInfo {
        available: false,
        current_version: "0.1.0".to_string(),
        version: None,
        body: None,
        date: None,
    };
    let dialog_latest = format_hoshino_update_dialog(&up_to_date);
    assert!(dialog_latest.contains("already running the latest version"));
}

#[test]
fn test_parse_and_validate_release_manifest() {
    let sample_manifest = r#"{
        "version": "v0.2.0",
        "notes": "Hoshino update notes",
        "pub_date": "2026-11-04T00:00:00Z",
        "platforms": {
            "windows-x86_64": {
                "signature": "mock_sig_win",
                "url": "https://github.com/nmkdeveloper/hoshicp/releases/download/v0.2.0/HoshiCP-windows-x64.zip"
            },
            "darwin-x86_64": {
                "signature": "mock_sig_mac",
                "url": "https://github.com/nmkdeveloper/hoshicp/releases/download/v0.2.0/HoshiCP.app.tar.gz"
            },
            "linux-x86_64": {
                "signature": "mock_sig_linux",
                "url": "https://github.com/nmkdeveloper/hoshicp/releases/download/v0.2.0/HoshiCP.AppImage.tar.gz"
            }
        }
    }"#;

    let manifest = parse_release_manifest(sample_manifest).expect("Should parse valid manifest");
    assert_eq!(manifest.version, "v0.2.0");
    assert_eq!(manifest.platforms.len(), 3);
    assert!(manifest.platforms.contains_key("windows-x86_64"));
    assert!(manifest.platforms.contains_key("darwin-x86_64"));
    assert!(manifest.platforms.contains_key("linux-x86_64"));

    assert!(validate_release_manifest(&manifest).is_ok());

    // Invalid: empty version
    let mut invalid_manifest = manifest.clone();
    invalid_manifest.version = "".to_string();
    assert!(validate_release_manifest(&invalid_manifest).is_err());

    // Invalid: no platforms
    let mut empty_platforms = manifest.clone();
    empty_platforms.platforms.clear();
    assert!(validate_release_manifest(&empty_platforms).is_err());

    // Invalid: missing signature
    let mut missing_sig = manifest.clone();
    missing_sig.platforms.get_mut("windows-x86_64").unwrap().signature = "".to_string();
    assert!(validate_release_manifest(&missing_sig).is_err());
}

#[tokio::test]
async fn test_mock_release_server_integration() {
    use axum::{routing::get, Json, Router};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::{TcpListener, TcpStream};

    let mut platforms = HashMap::new();
    platforms.insert(
        "windows-x86_64".to_string(),
        ReleaseManifestPlatform {
            signature: "sig123".to_string(),
            url: "https://example.com/win.zip".to_string(),
        },
    );

    let manifest_data = ReleaseManifest {
        version: "v0.2.0".to_string(),
        notes: Some("Blue Archive Hoshino release".to_string()),
        pub_date: Some("2026-11-04T00:00:00Z".to_string()),
        platforms,
    };

    let app = Router::new().route(
        "/releases/latest/download/latest.json",
        get({
            let manifest_data = manifest_data.clone();
            move || async move { Json(manifest_data) }
        }),
    );

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    let mut stream = TcpStream::connect(addr).await.expect("Failed to connect");
    let req = format!(
        "GET /releases/latest/download/latest.json HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
        addr
    );
    stream.write_all(req.as_bytes()).await.unwrap();

    let mut response_bytes = Vec::new();
    stream.read_to_end(&mut response_bytes).await.unwrap();
    let response_str = String::from_utf8_lossy(&response_bytes);

    let body = response_str.split("\r\n\r\n").nth(1).expect("HTTP body missing");
    let parsed = parse_release_manifest(body).unwrap();
    assert_eq!(parsed.version, "v0.2.0");
    assert!(parsed.platforms.contains_key("windows-x86_64"));

    server_handle.abort();
}
