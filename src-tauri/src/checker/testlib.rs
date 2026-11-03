pub use super::{CheckVerdict, DiffSpan};
use std::path::Path;
use std::process::Command;

/// Spawns a testlib executable checker (`./checker <input> <output> <answer>`)
/// and parses testlib exit codes:
/// 0 = OK, 1 = WA, 2 = PE, 3 = FAIL.
pub fn check_testlib(
    checker_bin: &Path,
    input: &Path,
    output: &Path,
    answer: &Path,
) -> CheckVerdict {
    let bin = if cfg!(windows) && checker_bin.extension().is_none() {
        let exe_candidate = checker_bin.with_extension("exe");
        if exe_candidate.exists() {
            exe_candidate
        } else {
            checker_bin.to_path_buf()
        }
    } else {
        checker_bin.to_path_buf()
    };

    let is_python = bin
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("py"))
        .unwrap_or(false);

    let mut cmd = if is_python {
        let mut c = Command::new(if cfg!(windows) { "python" } else { "python3" });
        c.arg(&bin);
        c
    } else {
        Command::new(&bin)
    };

    cmd.arg(input).arg(output).arg(answer);

    match cmd.output() {
        Ok(proc_out) => {
            let stderr_msg = String::from_utf8_lossy(&proc_out.stderr).trim().to_string();
            let stdout_msg = String::from_utf8_lossy(&proc_out.stdout).trim().to_string();
            let code = proc_out.status.code().unwrap_or(-1);

            let message = if !stderr_msg.is_empty() {
                stderr_msg
            } else if !stdout_msg.is_empty() {
                stdout_msg
            } else {
                match code {
                    0 => "OK".to_string(),
                    1 => "Wrong Answer".to_string(),
                    2 => "Presentation Error".to_string(),
                    3 => "Checker Failed".to_string(),
                    _ => format!("Checker exited with code {}", code),
                }
            };

            let ok = code == 0;
            CheckVerdict {
                ok,
                message,
                diff_positions: Vec::new(),
            }
        }
        Err(err) => CheckVerdict {
            ok: false,
            message: format!("Failed to execute checker: {}", err),
            diff_positions: Vec::new(),
        },
    }
}
