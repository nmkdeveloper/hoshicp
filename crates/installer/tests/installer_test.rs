// crates/installer/tests/installer_test.rs
use hoshicp_installer::setup::{
    extract_payload, is_process_running, parse_args_from, perform_install,
    register_uninstaller, terminate_process, unregister_uninstaller, InstallerOptions,
};
use hoshicp_installer::shortcuts::create_shortcut;
use std::path::PathBuf;

#[test]
fn test_installer_extracts_into_target_dir() {
    let temp_dir = tempfile::tempdir().unwrap();
    let opts = InstallerOptions {
        install_dir: temp_dir.path().to_path_buf(),
        create_desktop_shortcut: false,
        create_start_menu_shortcut: false,
        silent: true,
    };
    // Validate extraction logic without panic
    assert!(opts.install_dir.exists());
    let extracted = extract_payload(&opts.install_dir).expect("Extraction failed");
    assert!(extracted > 0, "Expected at least 1 file extracted");
    assert!(opts.install_dir.join("HoshiCP.exe").exists());
    assert!(opts.install_dir.join("README.txt").exists());
}

#[test]
fn test_cli_parsing() {
    let args = vec![
        "HoshiCP-Setup.exe".to_string(),
        "--silent".to_string(),
        "--no-shortcuts".to_string(),
        "--install-dir".to_string(),
        "C:\\TestPath\\HoshiCP".to_string(),
    ];
    let opts = parse_args_from(args.into_iter());
    assert!(opts.silent);
    assert!(!opts.create_desktop_shortcut);
    assert!(!opts.create_start_menu_shortcut);
    assert_eq!(opts.install_dir, PathBuf::from("C:\\TestPath\\HoshiCP"));

    // Test individual no-desktop / no-start-menu flags
    let args2 = vec![
        "HoshiCP-Setup.exe".to_string(),
        "-s".to_string(),
        "--no-desktop-shortcut".to_string(),
    ];
    let opts2 = parse_args_from(args2.into_iter());
    assert!(opts2.silent);
    assert!(!opts2.create_desktop_shortcut);
    assert!(opts2.create_start_menu_shortcut);
}

#[test]
fn test_process_detection_and_termination() {
    let fake_process = "nonexistent_hoshicp_dummy_12345.exe";
    let running = is_process_running(fake_process);
    assert!(!running);

    let term_res = terminate_process(fake_process);
    assert!(term_res.is_ok());
    assert_eq!(term_res.unwrap(), 0);
}

#[test]
fn test_shortcut_creation() {
    let temp_dir = tempfile::tempdir().unwrap();
    let dummy_exe = temp_dir.path().join("HoshiCP.exe");
    std::fs::write(&dummy_exe, b"MZ dummy executable").unwrap();

    let lnk_path = temp_dir.path().join("HoshiCP.lnk");
    let res = create_shortcut(&dummy_exe, &lnk_path, "HoshiCP CP Editor");
    assert!(res.is_ok(), "Shortcut creation should succeed: {:?}", res);
    assert!(lnk_path.exists(), "Shortcut file should exist on disk");
}

#[test]
fn test_registry_registration_cycle() {
    let temp_dir = tempfile::tempdir().unwrap();
    let reg_res = register_uninstaller(temp_dir.path());
    assert!(reg_res.is_ok(), "Registry registration should succeed: {:?}", reg_res);

    let unreg_res = unregister_uninstaller();
    assert!(unreg_res.is_ok(), "Registry unregistration should succeed: {:?}", unreg_res);
}

#[test]
fn test_headless_installation_flow() {
    let temp_dir = tempfile::tempdir().unwrap();
    let opts = InstallerOptions {
        install_dir: temp_dir.path().to_path_buf(),
        create_desktop_shortcut: false,
        create_start_menu_shortcut: false,
        silent: true,
    };
    let mut progress_events = Vec::new();
    let result = perform_install(&opts, |pct, msg| {
        progress_events.push((pct, msg.to_string()));
    });
    assert!(result.is_ok(), "Installation should succeed in headless mode: {:?}", result);
    assert!(!progress_events.is_empty(), "Progress events should be fired");
    assert!(opts.install_dir.join("HoshiCP.exe").exists());
}
