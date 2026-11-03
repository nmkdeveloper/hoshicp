use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileError {
    pub message: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Compilation failed: {}", self.message)
    }
}

impl std::error::Error for CompileError {}

fn quote_and_sanitize_path(path: &Path) -> String {
    let clean = path.to_string_lossy().replace(['\r', '\n'], "");
    format!("\"{}\"", clean.replace('"', "\\\""))
}

fn replace_placeholder(template: &str, placeholder: &str, safe_quoted: &str) -> String {
    let quoted_double = format!("\"{{{}}}\"", placeholder);
    let quoted_single = format!("'{{{}}}'", placeholder);
    let raw = format!("{{{}}}", placeholder);

    template
        .replace(&quoted_double, safe_quoted)
        .replace(&quoted_single, safe_quoted)
        .replace(&raw, safe_quoted)
}

/// Compiles a source file into an executable binary or returns an existing entry script (e.g. for Python).
/// Supports "cpp", "c++", "rust", "rs", "python", "py", "java".
/// Custom command can contain `{source}` and `{output}` placeholders.
pub fn compile_source(
    source_path: &Path,
    language: &str,
    custom_cmd: Option<&str>,
) -> Result<PathBuf, CompileError> {
    if !source_path.exists() {
        return Err(CompileError {
            message: format!("Source file does not exist: {}", source_path.display()),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
        });
    }

    let lang = language.to_ascii_lowercase();

    // Python does not need ahead-of-time compilation to binary
    if lang == "python" || lang == "py" {
        return Ok(source_path.to_path_buf());
    }

    let file_stem = source_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("solution");

    let parent_dir = source_path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));

    let exe_name = if cfg!(windows) {
        format!("{}.exe", file_stem)
    } else {
        file_stem.to_string()
    };

    let output_path = parent_dir.join(exe_name);

    if let Some(template) = custom_cmd {
        let safe_source = quote_and_sanitize_path(source_path);
        let safe_output = quote_and_sanitize_path(&output_path);

        let mut cmd_str = replace_placeholder(template, "source", &safe_source);
        cmd_str = replace_placeholder(&cmd_str, "file", &safe_source);
        cmd_str = replace_placeholder(&cmd_str, "output", &safe_output);

        return run_shell_command(&cmd_str, parent_dir, &output_path);
    }

    match lang.as_str() {
        "cpp" | "c++" => {
            let mut cmd = Command::new("g++");
            cmd.arg("-O2")
                .arg("-std=c++17")
                .arg(source_path)
                .arg("-o")
                .arg(&output_path)
                .current_dir(parent_dir);

            run_command(cmd, &output_path)
        }
        "rust" | "rs" => {
            let mut cmd = Command::new("rustc");
            cmd.arg("-O")
                .arg(source_path)
                .arg("-o")
                .arg(&output_path)
                .current_dir(parent_dir);

            run_command(cmd, &output_path)
        }
        "java" => {
            let mut cmd = Command::new("javac");
            cmd.arg(source_path).current_dir(parent_dir);

            let class_path = parent_dir.join(format!("{}.class", file_stem));
            run_command(cmd, &class_path)
        }
        other => Err(CompileError {
            message: format!("Unsupported language for default compilation: {}", other),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
        }),
    }
}

fn run_command(mut cmd: Command, expected_output: &Path) -> Result<PathBuf, CompileError> {
    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if output.status.success() {
                Ok(expected_output.to_path_buf())
            } else {
                Err(CompileError {
                    message: format!("Compiler exited with status: {}", output.status),
                    stdout,
                    stderr,
                    exit_code: output.status.code(),
                })
            }
        }
        Err(err) => Err(CompileError {
            message: format!("Failed to spawn compiler: {}", err),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
        }),
    }
}

#[cfg(windows)]
fn run_shell_command(cmd_str: &str, dir: &Path, expected_output: &Path) -> Result<PathBuf, CompileError> {
    use std::os::windows::process::CommandExt;
    let mut cmd = Command::new("cmd.exe");
    cmd.raw_arg(format!("/C {}", cmd_str));
    cmd.current_dir(dir);
    run_command(cmd, expected_output)
}

#[cfg(not(windows))]
fn run_shell_command(cmd_str: &str, dir: &Path, expected_output: &Path) -> Result<PathBuf, CompileError> {
    let mut cmd = Command::new("sh");
    cmd.arg("-c").arg(cmd_str);
    cmd.current_dir(dir);
    run_command(cmd, expected_output)
}
