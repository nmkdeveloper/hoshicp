pub mod compiler;
pub mod process;

pub use compiler::{compile_source, CompileError};
pub use process::{execute_testcase, execute_testcase_async, ExecutionResult, RunStatus};

use crate::models::TestCase;
use std::path::Path;

/// Executes a batch of test cases against an executable and returns results.
pub fn execute_testcases(
    executable: &Path,
    testcases: &[TestCase],
    time_limit_ms: u64,
    memory_limit_mb: u64,
) -> Vec<ExecutionResult> {
    testcases
        .iter()
        .map(|tc| execute_testcase(executable, &tc.input, time_limit_ms, memory_limit_mb))
        .collect()
}
