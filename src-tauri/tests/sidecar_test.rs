use hoshicp_lib::models::{ProblemMetadata, SidecarData, TestCase};
use hoshicp_lib::storage::sidecar::{load_sidecar, save_sidecar};

#[test]
fn test_sidecar_roundtrip() {
    let temp_dir = tempfile::tempdir().unwrap();
    let source_path = temp_dir.path().join("solution.cpp");
    std::fs::write(&source_path, "// code").unwrap();

    let data = SidecarData {
        problem: ProblemMetadata {
            name: "Watermelon".into(),
            group: "Codeforces - Beta Round 4".into(),
            url: "https://codeforces.com/problemset/problem/4/A".into(),
            time_limit: 1000,
            memory_limit: 64,
        },
        testcases: vec![TestCase {
            id: "tc_1".into(),
            input: "8\n".into(),
            output: "YES\n".into(),
            custom: false,
        }],
    };

    save_sidecar(&source_path, &data).expect("Save should succeed");
    let loaded = load_sidecar(&source_path).expect("Load should succeed");
    assert_eq!(loaded.problem.name, "Watermelon");
    assert_eq!(loaded.testcases.len(), 1);
    assert_eq!(loaded.testcases[0].input, "8\n");
}

#[test]
fn test_sidecar_not_found_returns_error() {
    let temp_dir = tempfile::tempdir().unwrap();
    let source_path = temp_dir.path().join("missing.cpp");
    let result = load_sidecar(&source_path);
    assert!(result.is_err());
}

#[test]
fn test_sidecar_filename_fallback() {
    let temp_dir = tempfile::tempdir().unwrap();
    let source_path = temp_dir.path().join("code.cpp");
    // Write sidecar with full filename style: code.cpp.hoshicp.json
    let alt_sidecar_path = temp_dir.path().join("code.cpp.hoshicp.json");
    let data = SidecarData {
        problem: ProblemMetadata {
            name: "Fallback Test".into(),
            group: "Contest".into(),
            url: "https://example.com".into(),
            time_limit: 2000,
            memory_limit: 128,
        },
        testcases: vec![TestCase {
            id: "1".into(),
            input: "in".into(),
            output: "out".into(),
            custom: true,
        }],
    };
    std::fs::write(
        &alt_sidecar_path,
        serde_json::to_string(&data).unwrap(),
    )
    .unwrap();

    let loaded = load_sidecar(&source_path).expect("Should load alt sidecar");
    assert_eq!(loaded.problem.name, "Fallback Test");
    assert!(loaded.testcases[0].custom);
}

