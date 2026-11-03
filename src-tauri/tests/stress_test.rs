use hoshicp_lib::stress::engine::{
    run_stress_step, run_stress_test, StressStatus, StressTestConfig,
};
use std::fs;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

#[test]
fn test_stress_step_detects_mismatch() {
    let input = "5\n";
    let model_out = "10\n";
    let buggy_target_out = "11\n";
    let status = run_stress_step(input, model_out, buggy_target_out);
    assert_eq!(status, StressStatus::Mismatch);
}

#[test]
fn test_stress_step_passed() {
    let input = "5\n";
    let model_out = "10 \n";
    let target_out = "10\n";
    let status = run_stress_step(input, model_out, target_out);
    assert_eq!(status, StressStatus::Passed);
}

#[tokio::test]
async fn test_run_stress_test_all_passed() {
    let temp_dir = tempfile::tempdir().unwrap();
    let gen_path = temp_dir.path().join("gen.py");
    let model_path = temp_dir.path().join("model.py");
    let target_path = temp_dir.path().join("target.py");

    fs::write(&gen_path, "import random\nprint(random.randint(1, 100))").unwrap();
    fs::write(
        &model_path,
        "import sys\nx = int(sys.stdin.read().strip())\nprint(x * 2)",
    )
    .unwrap();
    fs::write(
        &target_path,
        "import sys\nx = int(sys.stdin.read().strip())\nprint(x * 2)",
    )
    .unwrap();

    let config = StressTestConfig {
        generator_bin: gen_path,
        model_bin: model_path,
        target_bin: target_path,
        max_iterations: 3,
        time_limit_ms: 3000,
        memory_limit_mb: Some(256),
    };

    let cancel_token = CancellationToken::new();
    let progress_count = Arc::new(AtomicU32::new(0));
    let progress_clone = Arc::clone(&progress_count);

    let res = run_stress_test(config, cancel_token, move |iter| {
        progress_clone.store(iter, Ordering::SeqCst);
    })
    .await
    .unwrap();

    assert_eq!(res.status, StressStatus::Passed);
    assert_eq!(res.iteration, 3);
    assert_eq!(progress_count.load(Ordering::SeqCst), 3);
    assert!(res.failing_input.is_none());
}

#[tokio::test]
async fn test_run_stress_test_detects_mismatch() {
    let temp_dir = tempfile::tempdir().unwrap();
    let gen_path = temp_dir.path().join("gen_mismatch.py");
    let model_path = temp_dir.path().join("model_mismatch.py");
    let target_path = temp_dir.path().join("target_mismatch.py");

    fs::write(&gen_path, "print(42)").unwrap();
    fs::write(
        &model_path,
        "import sys\nx = int(sys.stdin.read().strip())\nprint(x * 2)",
    )
    .unwrap();
    fs::write(
        &target_path,
        "import sys\nx = int(sys.stdin.read().strip())\nprint(x * 2 + 1)",
    )
    .unwrap();

    let config = StressTestConfig {
        generator_bin: gen_path,
        model_bin: model_path,
        target_bin: target_path,
        max_iterations: 5,
        time_limit_ms: 3000,
        memory_limit_mb: None,
    };

    let cancel_token = CancellationToken::new();
    let res = run_stress_test(config, cancel_token, |_| {}).await.unwrap();

    assert_eq!(res.status, StressStatus::Mismatch);
    assert_eq!(res.iteration, 1);
    assert_eq!(res.failing_input.as_deref().unwrap().trim(), "42");
    assert_eq!(res.model_output.as_deref().unwrap().trim(), "84");
    assert_eq!(res.target_output.as_deref().unwrap().trim(), "85");
    assert!(res.message.is_some());
}

#[tokio::test]
async fn test_run_stress_test_cancellation() {
    let temp_dir = tempfile::tempdir().unwrap();
    let gen_path = temp_dir.path().join("gen_cancel.py");
    let model_path = temp_dir.path().join("model_cancel.py");
    let target_path = temp_dir.path().join("target_cancel.py");

    fs::write(&gen_path, "print(1)").unwrap();
    fs::write(&model_path, "print(1)").unwrap();
    fs::write(&target_path, "print(1)").unwrap();

    let config = StressTestConfig::new(gen_path, model_path, target_path, 10, 3000);
    let cancel_token = CancellationToken::new();
    // Cancel prior to running
    cancel_token.cancel();

    let res = run_stress_test(config, cancel_token, |_| {}).await.unwrap();
    assert_eq!(res.status, StressStatus::Cancelled);
    assert_eq!(res.iteration, 0);
}

#[tokio::test]
async fn test_run_stress_test_generator_error() {
    let temp_dir = tempfile::tempdir().unwrap();
    let gen_path = temp_dir.path().join("gen_err.py");
    let model_path = temp_dir.path().join("model_err.py");
    let target_path = temp_dir.path().join("target_err.py");

    fs::write(
        &gen_path,
        "import sys\nsys.stderr.write('Generator crash')\nsys.exit(1)",
    )
    .unwrap();
    fs::write(&model_path, "print(1)").unwrap();
    fs::write(&target_path, "print(1)").unwrap();

    let config = StressTestConfig::new(gen_path, model_path, target_path, 5, 3000);
    let cancel_token = CancellationToken::new();

    let res = run_stress_test(config, cancel_token, |_| {}).await.unwrap();
    assert_eq!(res.status, StressStatus::GeneratorError);
    assert_eq!(res.iteration, 1);
    assert!(res
        .message
        .as_deref()
        .unwrap()
        .contains("Generator crash"));
    assert!(res.failing_input.is_none());
}

#[tokio::test]
async fn test_run_stress_test_target_error() {
    let temp_dir = tempfile::tempdir().unwrap();
    let gen_path = temp_dir.path().join("gen_target_err.py");
    let model_path = temp_dir.path().join("model_target_err.py");
    let target_path = temp_dir.path().join("target_err.py");

    fs::write(&gen_path, "print(123)").unwrap();
    fs::write(&model_path, "print(123)").unwrap();
    fs::write(
        &target_path,
        "import sys\nsys.stderr.write('Target runtime error')\nsys.exit(1)",
    )
    .unwrap();

    let config = StressTestConfig::new(gen_path, model_path, target_path, 5, 3000);
    let cancel_token = CancellationToken::new();

    let res = run_stress_test(config, cancel_token, |_| {}).await.unwrap();
    assert_eq!(res.status, StressStatus::TargetError);
    assert_eq!(res.iteration, 1);
    assert_eq!(res.failing_input.as_deref().unwrap().trim(), "123");
    assert!(res
        .message
        .as_deref()
        .unwrap()
        .contains("Target runtime error"));
}

#[tokio::test]
async fn test_run_stress_test_model_error() {
    let temp_dir = tempfile::tempdir().unwrap();
    let gen_path = temp_dir.path().join("gen_model_err.py");
    let model_path = temp_dir.path().join("model_err.py");
    let target_path = temp_dir.path().join("target.py");

    fs::write(&gen_path, "print(100)").unwrap();
    fs::write(
        &model_path,
        "import sys\nsys.stderr.write('Model crash')\nsys.exit(1)",
    )
    .unwrap();
    fs::write(&target_path, "print(100)").unwrap();

    let config = StressTestConfig::new(gen_path, model_path, target_path, 5, 3000);
    let cancel_token = CancellationToken::new();

    let res = run_stress_test(config, cancel_token, |_| {}).await.unwrap();
    assert_eq!(res.status, StressStatus::ModelError);
    assert_eq!(res.iteration, 1);
    assert_eq!(res.failing_input.as_deref().unwrap().trim(), "100");
    assert!(res.model_output.is_some());
    assert!(res.target_output.is_none());
    assert!(res
        .message
        .as_deref()
        .unwrap()
        .contains("Model crash"));
}

#[tokio::test]
async fn test_run_stress_test_invalid_time_limit() {
    let config = StressTestConfig {
        generator_bin: "gen".into(),
        model_bin: "model".into(),
        target_bin: "target".into(),
        max_iterations: 5,
        time_limit_ms: 0,
        memory_limit_mb: None,
    };
    let cancel_token = CancellationToken::new();
    let res = run_stress_test(config, cancel_token, |_| {}).await;
    assert!(res.is_err());
}
