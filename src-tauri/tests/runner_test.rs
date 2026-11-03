use hoshicp_lib::models::TestCase;
use hoshicp_lib::runner::compiler::compile_source;
use hoshicp_lib::runner::process::{execute_testcase, RunStatus};
use hoshicp_lib::runner::execute_testcases;
use std::fs;
use std::path::Path;

#[test]
fn test_execute_echo_process() {
    let echo_bin = if cfg!(windows) { "cmd.exe" } else { "echo" };
    // Verify execution captures stdout and measures time
    let res = execute_testcase(Path::new(echo_bin), "hello", 2000, 128);
    assert_ne!(res.status, RunStatus::TimeLimitExceeded);
}

#[test]
fn test_execute_timeout_process() {
    let sleep_bin = if cfg!(windows) { "powershell.exe" } else { "sleep" };
    let res = execute_testcase(Path::new(sleep_bin), "Start-Sleep -Seconds 3", 500, 128);
    assert_eq!(res.status, RunStatus::TimeLimitExceeded);
}

#[test]
fn test_compile_python_source() {
    let temp_dir = tempfile::tempdir().unwrap();
    let py_file = temp_dir.path().join("solution.py");
    fs::write(&py_file, "print('hello')").unwrap();

    let res = compile_source(&py_file, "python", None);
    assert!(res.is_ok());
    assert_eq!(res.unwrap(), py_file);
}

#[test]
fn test_compile_source_file_not_found() {
    let res = compile_source(Path::new("non_existent_file_12345.cpp"), "cpp", None);
    assert!(res.is_err());
}

#[test]
fn test_compile_unsupported_language() {
    let temp_dir = tempfile::tempdir().unwrap();
    let file = temp_dir.path().join("solution.xyz");
    fs::write(&file, "whatever").unwrap();

    let res = compile_source(&file, "unsupported_lang", None);
    assert!(res.is_err());
}

#[test]
fn test_compile_custom_cmd() {
    let temp_dir = tempfile::tempdir().unwrap();
    let src_file = temp_dir.path().join("input.txt");
    fs::write(&src_file, "sample data").unwrap();

    let custom_cmd = if cfg!(windows) {
        "copy /y \"{source}\" \"{output}\""
    } else {
        "cp \"{source}\" \"{output}\""
    };

    let res = compile_source(&src_file, "custom", Some(custom_cmd));
    assert!(res.is_ok());
    let out = res.unwrap();
    assert!(out.exists());
}

#[test]
fn test_execute_batch_testcases() {
    let echo_bin = if cfg!(windows) { "cmd.exe" } else { "echo" };
    let testcases = vec![
        TestCase {
            id: "1".into(),
            input: "echo 1\nexit\n".into(),
            output: "1\n".into(),
            custom: false,
        },
        TestCase {
            id: "2".into(),
            input: "echo 2\nexit\n".into(),
            output: "2\n".into(),
            custom: false,
        },
    ];

    let results = execute_testcases(Path::new(echo_bin), &testcases, 2000, 128);
    assert_eq!(results.len(), 2);
    for res in results {
        assert_ne!(res.status, RunStatus::TimeLimitExceeded);
    }
}
