#[test]
fn test_app_identifier_and_version() {
    let conf_str = include_str!("../tauri.conf.json");
    let conf: serde_json::Value = serde_json::from_str(conf_str).expect("Valid JSON");
    assert_eq!(conf["identifier"], "com.nmkdeveloper.hoshicp");
    assert_eq!(conf["productName"], "HoshiCP");
}
