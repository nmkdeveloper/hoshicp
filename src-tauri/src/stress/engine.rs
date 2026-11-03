use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use crate::checker::check_tokens;
use crate::error::AppError;
use crate::runner::process::{execute_testcase_async, RunStatus};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StressStatus {
    Passed,
    Mismatch,
    GeneratorError,
    ModelError,
    TargetError,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StressTestConfig {
    pub generator_bin: PathBuf,
    pub model_bin: PathBuf,
    pub target_bin: PathBuf,
    pub max_iterations: u32,
    pub time_limit_ms: u64,
    pub memory_limit_mb: Option<u64>,
}

impl Default for StressTestConfig {
    fn default() -> Self {
        Self {
            generator_bin: PathBuf::new(),
            model_bin: PathBuf::new(),
            target_bin: PathBuf::new(),
            max_iterations: 100,
            time_limit_ms: 2000,
            memory_limit_mb: Some(256),
        }
    }
}

impl StressTestConfig {
    pub fn new(
        generator_bin: impl Into<PathBuf>,
        model_bin: impl Into<PathBuf>,
        target_bin: impl Into<PathBuf>,
        max_iterations: u32,
        time_limit_ms: u64,
    ) -> Self {
        Self {
            generator_bin: generator_bin.into(),
            model_bin: model_bin.into(),
            target_bin: target_bin.into(),
            max_iterations,
            time_limit_ms,
            memory_limit_mb: Some(256),
        }
    }

    pub fn with_memory_limit(mut self, memory_limit_mb: u64) -> Self {
        self.memory_limit_mb = Some(memory_limit_mb);
        self
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StressTestResult {
    pub iteration: u32,
    pub status: StressStatus,
    pub failing_input: Option<String>,
    pub model_output: Option<String>,
    pub target_output: Option<String>,
    pub message: Option<String>,
}

/// Validates target output against model output for a single stress iteration step.
pub fn run_stress_step(_input: &str, model_out: &str, target_out: &str) -> StressStatus {
    let verdict = check_tokens(target_out, model_out);
    if verdict.ok {
        StressStatus::Passed
    } else {
        StressStatus::Mismatch
    }
}

/// Orchestrates an automated stress testing loop across generator, model, and target binaries.
pub async fn run_stress_test<F: Fn(u32) + Send + Sync + 'static>(
    config: StressTestConfig,
    cancel_token: CancellationToken,
    on_progress: F,
) -> Result<StressTestResult, AppError> {
    if config.time_limit_ms == 0 {
        return Err(AppError::Generic(
            "Time limit must be greater than 0 ms".to_string(),
        ));
    }

    let memory_limit_mb = config.memory_limit_mb.unwrap_or(256);

    for iteration in 1..=config.max_iterations {
        if cancel_token.is_cancelled() {
            return Ok(StressTestResult {
                iteration: iteration.saturating_sub(1),
                status: StressStatus::Cancelled,
                failing_input: None,
                model_output: None,
                target_output: None,
                message: Some("Stress test cancelled".to_string()),
            });
        }

        on_progress(iteration);

        let step_future = async {
            // 1. Run generator to create random input
            let gen_res = execute_testcase_async(
                &config.generator_bin,
                "",
                config.time_limit_ms,
                memory_limit_mb,
            )
            .await;

            if gen_res.status != RunStatus::Accepted {
                return StressTestResult {
                    iteration,
                    status: StressStatus::GeneratorError,
                    failing_input: None,
                    model_output: None,
                    target_output: None,
                    message: Some(if gen_res.stderr.is_empty() {
                        format!("Generator failed with status: {:?}", gen_res.status)
                    } else {
                        gen_res.stderr
                    }),
                };
            }

            let input = gen_res.stdout;

            // 2. Run reference / model solution
            let model_res = execute_testcase_async(
                &config.model_bin,
                &input,
                config.time_limit_ms,
                memory_limit_mb,
            )
            .await;

            if model_res.status != RunStatus::Accepted {
                return StressTestResult {
                    iteration,
                    status: StressStatus::ModelError,
                    failing_input: Some(input),
                    model_output: Some(model_res.stdout),
                    target_output: None,
                    message: Some(if model_res.stderr.is_empty() {
                        format!("Model failed with status: {:?}", model_res.status)
                    } else {
                        model_res.stderr
                    }),
                };
            }

            // 3. Run target candidate solution
            let target_res = execute_testcase_async(
                &config.target_bin,
                &input,
                config.time_limit_ms,
                memory_limit_mb,
            )
            .await;

            if target_res.status != RunStatus::Accepted {
                return StressTestResult {
                    iteration,
                    status: StressStatus::TargetError,
                    failing_input: Some(input),
                    model_output: Some(model_res.stdout),
                    target_output: Some(target_res.stdout),
                    message: Some(if target_res.stderr.is_empty() {
                        format!("Target failed with status: {:?}", target_res.status)
                    } else {
                        target_res.stderr
                    }),
                };
            }

            // 4. Compare model vs target output
            let status = run_stress_step(&input, &model_res.stdout, &target_res.stdout);
            if status == StressStatus::Mismatch {
                let verdict = check_tokens(&target_res.stdout, &model_res.stdout);
                return StressTestResult {
                    iteration,
                    status: StressStatus::Mismatch,
                    failing_input: Some(input),
                    model_output: Some(model_res.stdout),
                    target_output: Some(target_res.stdout),
                    message: Some(verdict.message),
                };
            }

            StressTestResult {
                iteration,
                status: StressStatus::Passed,
                failing_input: None,
                model_output: None,
                target_output: None,
                message: None,
            }
        };

        tokio::select! {
            _ = cancel_token.cancelled() => {
                return Ok(StressTestResult {
                    iteration: iteration.saturating_sub(1),
                    status: StressStatus::Cancelled,
                    failing_input: None,
                    model_output: None,
                    target_output: None,
                    message: Some("Stress test cancelled".to_string()),
                });
            }
            res = step_future => {
                if res.status != StressStatus::Passed {
                    return Ok(res);
                }
            }
        }
    }

    Ok(StressTestResult {
        iteration: config.max_iterations,
        status: StressStatus::Passed,
        failing_input: None,
        model_output: None,
        target_output: None,
        message: None,
    })
}
