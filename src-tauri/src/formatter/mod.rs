use std::fmt;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub enum FormatterError {
    BinaryNotFound(String),
    ExecutionFailed(String),
    UnsupportedLanguage(String),
    Io(String),
}

impl fmt::Display for FormatterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FormatterError::BinaryNotFound(bin) => write!(f, "Formatter binary not found: {}", bin),
            FormatterError::ExecutionFailed(msg) => write!(f, "Formatter execution failed: {}", msg),
            FormatterError::UnsupportedLanguage(lang) => {
                write!(f, "Unsupported language for formatting: {}", lang)
            }
            FormatterError::Io(err) => write!(f, "I/O error during formatting: {}", err),
        }
    }
}

impl std::error::Error for FormatterError {}

/// Formats code by piping `source` into standard input of `binary` with `args`,
/// and capturing stdout.
pub fn format_source_with_cli(
    source: &str,
    binary: &str,
    args: &[&str],
) -> Result<String, FormatterError> {
    let mut cmd = Command::new(binary);
    cmd.args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                FormatterError::BinaryNotFound(binary.to_string())
            } else {
                FormatterError::Io(e.to_string())
            }
        })?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(source.as_bytes())
            .map_err(|e| FormatterError::Io(e.to_string()))?;
        // Dropping stdin closes EOF to signal the formatter to process input
    }

    let output = child
        .wait_with_output()
        .map_err(|e| FormatterError::Io(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let msg = if stderr.is_empty() {
            format!("Formatter process exited with status {}", output.status)
        } else {
            stderr
        };
        return Err(FormatterError::ExecutionFailed(msg));
    }

    let formatted = String::from_utf8(output.stdout)
        .map_err(|e| FormatterError::Io(format!("Invalid UTF-8 in formatter output: {}", e)))?;

    Ok(formatted)
}

/// Formats source code based on language using standard CLI formatters.
/// - C/C++: `clang-format`
/// - Rust: `rustfmt`
/// - Python: `black`, falling back to `yapf`
pub fn format_code(
    source: &str,
    language: &str,
    custom_config: Option<&Path>,
) -> Result<String, FormatterError> {
    match language.trim().to_ascii_lowercase().as_str() {
        "c" | "cpp" | "c++" | "cc" | "cxx" | "h" | "hpp" => {
            let mut args = Vec::new();
            let style_arg;
            if let Some(config) = custom_config {
                style_arg = format!("--style=file:{}", config.display());
                args.push(style_arg.as_str());
            } else {
                args.push("--fallback-style=LLVM");
            }
            format_source_with_cli(source, "clang-format", &args)
        }
        "rust" | "rs" => {
            let mut args = vec!["--emit=stdout"];
            let config_arg;
            if let Some(config) = custom_config {
                config_arg = config.display().to_string();
                args.push("--config-path");
                args.push(&config_arg);
            }
            format_source_with_cli(source, "rustfmt", &args)
        }
        "python" | "py" => {
            // Try black first, fall back to yapf if black is missing
            let mut black_args = vec!["-", "-q"];
            let black_config;
            if let Some(config) = custom_config {
                black_config = config.display().to_string();
                black_args.push("--config");
                black_args.push(&black_config);
            }

            match format_source_with_cli(source, "black", &black_args) {
                Err(FormatterError::BinaryNotFound(_)) => {
                    let mut yapf_args = Vec::new();
                    let yapf_config;
                    if let Some(config) = custom_config {
                        yapf_config = format!("--style={}", config.display());
                        yapf_args.push(yapf_config.as_str());
                    }
                    format_source_with_cli(source, "yapf", &yapf_args)
                }
                res => res,
            }
        }
        other => Err(FormatterError::UnsupportedLanguage(other.to_string())),
    }
}
