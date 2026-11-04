use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio_util::sync::CancellationToken;

use crate::checker::{check_tokens, DiffSpan};
use crate::models::{ProblemMetadata, SidecarData, TestCase};
use crate::runner::process::{execute_testcase_async, RunStatus};
use crate::stress::engine::{StressTestConfig, StressTestResult};

#[derive(Default)]
pub struct StressState {
    pub cancel_token: Mutex<Option<CancellationToken>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TestCaseExecutionResult {
    pub id: String,
    pub status: RunStatus,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub execution_time_ms: u64,
    pub memory_usage_kb: u64,
    pub diff_positions: Vec<DiffSpan>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BatchRunResult {
    pub results: Vec<TestCaseExecutionResult>,
    pub logs: Option<String>,
}

fn write_temp_source(source_code: &str, language: &str) -> Result<PathBuf, String> {
    let ext = match language.to_ascii_lowercase().as_str() {
        "cpp" | "c++" | "c" => "cpp",
        "rust" | "rs" => "rs",
        "python" | "py" => "py",
        "java" => "java",
        _ => "txt",
    };
    let temp_dir = std::env::temp_dir().join("hoshicp_sources");
    let _ = fs::create_dir_all(&temp_dir);
    let file_path = temp_dir.join(format!("solution_{}.{}", std::process::id(), ext));
    fs::write(&file_path, source_code).map_err(|e| format!("Failed to write source file: {}", e))?;
    Ok(file_path)
}

pub fn evaluate_testcase_output(
    tc_id: String,
    exec_res: crate::runner::process::ExecutionResult,
    expected_output: &str,
) -> TestCaseExecutionResult {
    let mut status = exec_res.status;
    let mut diff_positions = Vec::new();
    let mut message = None;

    if status == RunStatus::Accepted {
        let verdict = check_tokens(&exec_res.stdout, expected_output);
        if !verdict.ok {
            status = RunStatus::WrongAnswer;
            diff_positions = verdict.diff_positions;
            message = Some(verdict.message);
        }
    }

    TestCaseExecutionResult {
        id: tc_id,
        status,
        stdout: exec_res.stdout,
        stderr: exec_res.stderr,
        exit_code: exec_res.exit_code,
        execution_time_ms: exec_res.execution_time_ms,
        memory_usage_kb: exec_res.memory_usage_kb,
        diff_positions,
        message,
    }
}

#[tauri::command]
pub async fn compile_source(
    source_code: Option<String>,
    language: String,
    file_path: Option<String>,
    custom_cmd: Option<String>,
) -> Result<String, String> {
    let path = match file_path {
        Some(p) => PathBuf::from(p),
        None => write_temp_source(source_code.as_deref().unwrap_or(""), &language)?,
    };

    let compiled_binary = crate::runner::compiler::compile_source(
        &path,
        &language,
        custom_cmd.as_deref(),
    )
    .map_err(|e| e.to_string())?;

    Ok(compiled_binary.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn run_testcase(
    executable_path: String,
    testcase: TestCase,
    time_limit_ms: Option<u64>,
    memory_limit_mb: Option<u64>,
) -> Result<TestCaseExecutionResult, String> {
    let time_limit = time_limit_ms.unwrap_or(2000);
    let memory_limit = memory_limit_mb.unwrap_or(256);
    let exec_path = PathBuf::from(&executable_path);

    let exec_res =
        execute_testcase_async(&exec_path, &testcase.input, time_limit, memory_limit).await;
    Ok(evaluate_testcase_output(
        testcase.id,
        exec_res,
        &testcase.output,
    ))
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn run_all_testcases(
    source_code: Option<String>,
    language: Option<String>,
    file_path: Option<String>,
    executable_path: Option<String>,
    testcases: Vec<TestCase>,
    time_limit_ms: Option<u64>,
    memory_limit_mb: Option<u64>,
    custom_cmd: Option<String>,
) -> Result<BatchRunResult, String> {
    let time_limit = time_limit_ms.unwrap_or(2000);
    let memory_limit = memory_limit_mb.unwrap_or(256);

    let exec_binary = if let Some(bin) = executable_path {
        PathBuf::from(bin)
    } else {
        let lang = language.as_deref().unwrap_or("cpp");
        let path = match file_path {
            Some(p) => PathBuf::from(p),
            None => write_temp_source(source_code.as_deref().unwrap_or(""), lang)?,
        };

        match crate::runner::compiler::compile_source(&path, lang, custom_cmd.as_deref()) {
            Ok(b) => b,
            Err(e) => {
                let err_msg = format!("Compilation failed: {}", e.stderr);
                let failed_results = testcases
                    .into_iter()
                    .map(|tc| TestCaseExecutionResult {
                        id: tc.id,
                        status: RunStatus::CompilationError,
                        stdout: String::new(),
                        stderr: e.stderr.clone(),
                        exit_code: e.exit_code,
                        execution_time_ms: 0,
                        memory_usage_kb: 0,
                        diff_positions: Vec::new(),
                        message: Some(e.message.clone()),
                    })
                    .collect();
                return Ok(BatchRunResult {
                    results: failed_results,
                    logs: Some(err_msg),
                });
            }
        }
    };

    let mut results = Vec::new();
    for tc in testcases {
        let exec_res =
            execute_testcase_async(&exec_binary, &tc.input, time_limit, memory_limit).await;
        results.push(evaluate_testcase_output(tc.id, exec_res, &tc.output));
    }

    Ok(BatchRunResult {
        results,
        logs: Some("Execution finished successfully.".to_string()),
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn compile_and_run(
    source_code: Option<String>,
    language: String,
    testcases: Vec<TestCase>,
    time_limit_ms: Option<u64>,
    memory_limit_mb: Option<u64>,
    file_path: Option<String>,
    custom_cmd: Option<String>,
) -> Result<BatchRunResult, String> {
    run_all_testcases(
        source_code,
        Some(language),
        file_path,
        None,
        testcases,
        time_limit_ms,
        memory_limit_mb,
        custom_cmd,
    )
    .await
}

#[tauri::command]
pub async fn run_stress_test(
    app: tauri::AppHandle,
    state: tauri::State<'_, StressState>,
    config: StressTestConfig,
) -> Result<StressTestResult, String> {
    let cancel_token = CancellationToken::new();
    {
        let mut guard = state.cancel_token.lock().unwrap();
        *guard = Some(cancel_token.clone());
    }

    let app_handle = app.clone();
    let res = crate::stress::run_stress_test(config, cancel_token, move |iteration| {
        let _ = app_handle.emit("stress:progress", serde_json::json!({ "iteration": iteration }));
    })
    .await
    .map_err(|e| e.to_string());

    if let Ok(mut guard) = state.cancel_token.lock() {
        *guard = None;
    }

    res
}

#[tauri::command]
pub fn cancel_stress_test(state: tauri::State<'_, StressState>) {
    if let Ok(guard) = state.cancel_token.lock() {
        if let Some(token) = guard.as_ref() {
            token.cancel();
        }
    }
}

#[tauri::command]
pub async fn start_lsp_server(language: String) -> Result<u16, String> {
    let lang = language.to_ascii_lowercase();
    let (binary, args): (&str, &[&str]) = match lang.as_str() {
        "cpp" | "c++" | "c" => ("clangd", &[]),
        "rust" | "rs" => ("rust-analyzer", &[]),
        "python" | "py" => ("pylsp", &[]),
        _ => return Err(format!("Unsupported language for LSP: {}", language)),
    };

    match crate::lsp::start_lsp_proxy(&lang, binary, args).await {
        Ok(port) => Ok(port),
        Err(e) => {
            if lang == "python" || lang == "py" {
                if let Ok(port) =
                    crate::lsp::start_lsp_proxy(&lang, "pyright-langserver", &["--stdio"]).await
                {
                    return Ok(port);
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn format_source_code(
    source_code: String,
    language: String,
    custom_config: Option<String>,
) -> Result<String, String> {
    let config_path = custom_config.as_deref().map(Path::new);
    crate::formatter::format_code(&source_code, &language, config_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_sidecar_file(
    source_path: String,
    problem: Option<ProblemMetadata>,
    testcases: Option<Vec<TestCase>>,
    data: Option<SidecarData>,
) -> Result<(), String> {
    let sidecar_data = match data {
        Some(d) => d,
        None => SidecarData {
            problem: problem.unwrap_or_default(),
            testcases: testcases.unwrap_or_default(),
        },
    };
    crate::storage::save_sidecar(Path::new(&source_path), &sidecar_data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_sidecar_file(source_path: String) -> Result<SidecarData, String> {
    crate::storage::load_sidecar(Path::new(&source_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_close(window: tauri::Window) {
    let _ = window.close();
}

#[tauri::command]
pub fn window_minimize(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn window_toggle_maximize(window: tauri::Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
pub fn window_start_dragging(window: tauri::Window) {
    let _ = window.start_dragging();
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileOpenResult {
    pub path: String,
    pub name: String,
    pub content: String,
}

#[tauri::command]
pub async fn dialog_open_code_file() -> Result<Option<FileOpenResult>, String> {
    let file = rfd::AsyncFileDialog::new()
        .add_filter("Source Code", &["cpp", "cc", "c", "cxx", "py", "rs", "java", "txt"])
        .add_filter("All Files", &["*"])
        .pick_file()
        .await;

    if let Some(f) = file {
        let path = f.path().to_string_lossy().to_string();
        let name = f.file_name();
        let content = std::fs::read_to_string(f.path()).map_err(|e| e.to_string())?;
        Ok(Some(FileOpenResult { path, name, content }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn dialog_save_code_file(default_name: String, content: String) -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_file_name(&default_name)
        .add_filter("C++ Source", &["cpp", "cc"])
        .add_filter("Rust Source", &["rs"])
        .add_filter("Python Script", &["py"])
        .add_filter("Java Source", &["java"])
        .add_filter("All Files", &["*"])
        .save_file()
        .await;

    if let Some(f) = file {
        let path = f.path().to_path_buf();
        std::fs::write(&path, content).map_err(|e| e.to_string())?;
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn dialog_open_testcase_file() -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .add_filter("Testcase / Sidecar", &["json", "cpe", "in", "out", "ans", "txt"])
        .add_filter("All Files", &["*"])
        .pick_file()
        .await;

    if let Some(f) = file {
        let content = std::fs::read_to_string(f.path()).map_err(|e| e.to_string())?;
        Ok(Some(content))
    } else {
        Ok(None)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestcaseFileItem {
    pub path: String,
    pub name: String,
    pub content: String,
}

#[tauri::command]
pub async fn dialog_open_testcase_files() -> Result<Vec<TestcaseFileItem>, String> {
    let files = rfd::AsyncFileDialog::new()
        .add_filter("Testcase Files", &["in", "out", "ans", "txt", "json", "cpe"])
        .add_filter("All Files", &["*"])
        .pick_files()
        .await;

    let mut results = Vec::new();
    if let Some(handles) = files {
        for handle in handles {
            let path = handle.path().to_string_lossy().to_string();
            let name = handle.file_name();
            if let Ok(content) = std::fs::read_to_string(handle.path()) {
                results.push(TestcaseFileItem { path, name, content });
            }
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn dialog_save_testcase_file(default_name: String, content: String) -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_file_name(&default_name)
        .add_filter("JSON / Sidecar", &["json", "cpe", "txt"])
        .save_file()
        .await;

    if let Some(f) = file {
        let path = f.path().to_path_buf();
        std::fs::write(&path, content).map_err(|e| e.to_string())?;
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn write_file_to_path(path: String, content: String) -> Result<(), String> {
    std::fs::write(Path::new(&path), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_system_fonts() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        use std::collections::BTreeSet;
        use winreg::enums::*;
        use winreg::RegKey;

        let mut fonts = BTreeSet::new();

        let hives = [
            (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"),
            (HKEY_CURRENT_USER, r"Software\Microsoft\Windows NT\CurrentVersion\Fonts"),
        ];

        for (hive, subkey) in hives {
            let root = RegKey::predef(hive);
            if let Ok(key) = root.open_subkey(subkey) {
                for value in key.enum_values().flatten() {
                    let mut name = value.0;
                    if let Some(pos) = name.find('(') {
                        name = name[..pos].trim().to_string();
                    }
                    if let Some(pos) = name.find('&') {
                        name = name[..pos].trim().to_string();
                    }
                    name = name.trim().to_string();
                    if !name.is_empty() && name.len() < 64 {
                        fonts.insert(name);
                    }
                }
            }
        }

        let defaults = [
            "Consolas",
            "Cascadia Code",
            "Cascadia Mono",
            "Courier New",
            "Fira Code",
            "JetBrains Mono",
            "Lucida Console",
            "Segoe UI",
            "Source Code Pro",
        ];
        for d in defaults {
            fonts.insert(d.to_string());
        }

        Ok(fonts.into_iter().collect())
    }

    #[cfg(not(windows))]
    {
        Ok(vec![
            "JetBrains Mono".into(),
            "Fira Code".into(),
            "Cascadia Code".into(),
            "Consolas".into(),
            "Menlo".into(),
            "Monaco".into(),
            "Courier New".into(),
            "Source Code Pro".into(),
            "DejaVu Sans Mono".into(),
            "Ubuntu Mono".into(),
            "SF Mono".into(),
        ])
    }
}
