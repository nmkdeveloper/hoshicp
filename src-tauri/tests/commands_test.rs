use std::fs;
use hoshicp_lib::commands::{
    evaluate_testcase_output, format_source_code, load_sidecar_file, run_all_testcases,
    run_testcase, save_sidecar_file,
};
use hoshicp_lib::models::{ProblemMetadata, SidecarData, TestCase};
use hoshicp_lib::runner::process::{ExecutionResult, RunStatus};

#[tokio::test]
async fn test_evaluate_testcase_output() {
    let exec_res = ExecutionResult {
        stdout: "hello world\n".into(),
        stderr: "".into(),
        exit_code: Some(0),
        execution_time_ms: 12,
        memory_usage_kb: 512,
        status: RunStatus::Accepted,
    };

    // Test match -> Accepted
    let verdict_ac = evaluate_testcase_output("tc1".into(), exec_res.clone(), "hello world\n");
    assert_eq!(verdict_ac.status, RunStatus::Accepted);
    assert!(verdict_ac.diff_positions.is_empty());

    // Test mismatch -> WrongAnswer with diff
    let verdict_wa = evaluate_testcase_output("tc2".into(), exec_res, "goodbye world\n");
    assert_eq!(verdict_wa.status, RunStatus::WrongAnswer);
    assert!(!verdict_wa.diff_positions.is_empty());
}

#[tokio::test]
async fn test_run_testcase_echo() {
    let echo_bin = if cfg!(windows) { "cmd.exe" } else { "echo" };
    let input = if cfg!(windows) {
        "echo 42\nexit\n"
    } else {
        "42\n"
    };

    let tc = TestCase {
        id: "1".into(),
        input: input.into(),
        output: "42\n".into(),
        custom: false,
    };

    let res = run_testcase(echo_bin.into(), tc, Some(2000), Some(128)).await;
    assert!(res.is_ok());
    let r = res.unwrap();
    assert_eq!(r.id, "1");
    assert_ne!(r.status, RunStatus::TimeLimitExceeded);
}

#[tokio::test]
async fn test_run_all_testcases_python() {
    let temp_dir = tempfile::tempdir().unwrap();
    let py_file = temp_dir.path().join("sol.py");
    fs::write(&py_file, "x = input()\nprint(f'Echo: {x}')\n").unwrap();

    let testcases = vec![
        TestCase {
            id: "1".into(),
            input: "hello\n".into(),
            output: "Echo: hello\n".into(),
            custom: false,
        },
        TestCase {
            id: "2".into(),
            input: "world\n".into(),
            output: "Echo: mismatch\n".into(),
            custom: false,
        },
    ];

    let batch = run_all_testcases(
        None,
        Some("python".into()),
        Some(py_file.to_string_lossy().to_string()),
        None,
        testcases,
        Some(2000),
        Some(128),
        None,
    )
    .await
    .expect("batch execution should succeed");

    assert_eq!(batch.results.len(), 2);
    assert_eq!(batch.results[0].status, RunStatus::Accepted);
    assert_eq!(batch.results[1].status, RunStatus::WrongAnswer);
}

#[test]
fn test_sidecar_commands_roundtrip() {
    let temp_dir = tempfile::tempdir().unwrap();
    let src_file = temp_dir.path().join("main.cpp");
    fs::write(&src_file, "int main() {}").unwrap();

    let problem = ProblemMetadata {
        name: "Test Problem".into(),
        group: "CF Div 2".into(),
        url: "https://codeforces.com".into(),
        time_limit: 1000,
        memory_limit: 256,
    };
    let testcases = vec![TestCase {
        id: "1".into(),
        input: "1 2\n".into(),
        output: "3\n".into(),
        custom: false,
    }];

    let save_res = save_sidecar_file(
        src_file.to_string_lossy().to_string(),
        Some(problem.clone()),
        Some(testcases.clone()),
        None,
    );
    assert!(save_res.is_ok());

    let load_res = load_sidecar_file(src_file.to_string_lossy().to_string());
    assert!(load_res.is_ok());
    let loaded: SidecarData = load_res.unwrap();
    assert_eq!(loaded.problem.name, "Test Problem");
    assert_eq!(loaded.testcases.len(), 1);
}

#[test]
fn test_format_source_code_unsupported() {
    let res = format_source_code("hello".into(), "unsupported_lang_xyz".into(), None);
    assert!(res.is_err());
}
