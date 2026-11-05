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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleFontInfo {
    pub family: String,
    pub slug: String,
    pub url: String,
    pub css_content: String,
    pub cached: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadedFontEntry {
    pub family: String,
    pub slug: String,
    pub url: String,
    pub css_content: String,
}

fn slugify(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn parse_google_font_input(input: &str) -> (String, String, String) {
    let trimmed = input.trim();
    if trimmed.contains("fonts.googleapis.com/css2") {
        let family = if let Some(idx) = trimmed.find("family=") {
            let sub = &trimmed[idx + 7..];
            let end = sub.find('&').unwrap_or(sub.len());
            let raw_fam = &sub[..end];
            let raw_name = raw_fam.split(':').next().unwrap_or(raw_fam);
            raw_name.replace('+', " ")
        } else {
            "Google Font".to_string()
        };
        let slug = slugify(&family);
        (trimmed.to_string(), family, slug)
    } else if trimmed.contains("fonts.google.com/specimen/") {
        let sub = trimmed.split("specimen/").nth(1).unwrap_or(trimmed);
        let end = sub.find('?').unwrap_or(sub.len());
        let raw_name = &sub[..end];
        let family = raw_name.replace('+', " ");
        let slug = slugify(&family);
        let url = format!(
            "https://fonts.googleapis.com/css2?family={}:wght@400;500;600;700&display=swap",
            family.replace(' ', "+")
        );
        (url, family, slug)
    } else {
        let family = trimmed.to_string();
        let slug = slugify(&family);
        let url = format!(
            "https://fonts.googleapis.com/css2?family={}:wght@400;500;600;700&display=swap",
            family.replace(' ', "+")
        );
        (url, family, slug)
    }
}

#[tauri::command]
pub async fn download_google_font(
    app: tauri::AppHandle,
    font_input: String,
) -> Result<GoogleFontInfo, String> {
    use tauri::Manager;
    let (url, family, slug) = parse_google_font_input(&font_input);
    if slug.is_empty() {
        return Err("Invalid font name or URL".to_string());
    }

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let font_dir = app_data.join("fonts").join(&slug);
    let css_file = font_dir.join("font.css");

    // 1. Check if font already exists in application directory
    if css_file.exists() {
        if let Ok(content) = fs::read_to_string(&css_file) {
            return Ok(GoogleFontInfo {
                family,
                slug,
                url,
                css_content: content,
                cached: true,
            });
        }
    }

    // 2. Fetch stylesheet from Google Fonts
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let css_text = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Google Fonts: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read Google Fonts CSS: {}", e))?;

    if !css_text.contains("@font-face") {
        return Err(format!("Google Fonts did not return a valid font for '{}'", family));
    }

    // Extract detected font-family name from CSS if possible
    let detected_family = if let Some(idx) = css_text.find("font-family:") {
        let sub = &css_text[idx + 12..];
        let end = sub.find(';').unwrap_or(sub.len());
        sub[..end].trim().trim_matches('\'').trim_matches('"').to_string()
    } else {
        family.clone()
    };

    let _ = fs::create_dir_all(&font_dir);

    // 3. Download font chunks (woff2) and embed as data URLs for zero-latency offline portability
    let mut final_css = css_text.clone();
    let url_pattern = "https://fonts.gstatic.com/s/";
    let mut search_from = 0;
    let mut chunk_idx = 0;

    while let Some(start_idx) = final_css[search_from..].find(url_pattern) {
        let actual_start = search_from + start_idx;
        let sub = &final_css[actual_start..];
        if let Some(end_idx) = sub.find(')') {
            let font_url = sub[..end_idx].trim().trim_matches('\'').trim_matches('"');
            chunk_idx += 1;

            if let Ok(resp) = client.get(font_url).send().await {
                if let Ok(bytes) = resp.bytes().await {
                    // Save chunk file to app font directory
                    let chunk_path = font_dir.join(format!("chunk_{}.woff2", chunk_idx));
                    let _ = fs::write(&chunk_path, &bytes);

                    // Replace with data URL in final CSS
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    let data_url = format!("data:font/woff2;base64,{}", b64);
                    final_css.replace_range(actual_start..actual_start + font_url.len(), &data_url);
                    search_from = actual_start + data_url.len();
                    continue;
                }
            }
            search_from = actual_start + font_url.len();
        } else {
            break;
        }
    }

    // Write final CSS to disk
    fs::write(&css_file, &final_css).map_err(|e| format!("Failed to save font CSS: {}", e))?;

    // Update manifest.json
    let manifest_path = app_data.join("fonts").join("manifest.json");
    let mut entries: Vec<DownloadedFontEntry> = if manifest_path.exists() {
        fs::read_to_string(&manifest_path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    entries.retain(|e| e.slug != slug);
    entries.push(DownloadedFontEntry {
        family: detected_family.clone(),
        slug: slug.clone(),
        url: url.clone(),
        css_content: final_css.clone(),
    });

    if let Ok(serialized) = serde_json::to_string_pretty(&entries) {
        let _ = fs::write(&manifest_path, serialized);
    }

    Ok(GoogleFontInfo {
        family: detected_family,
        slug,
        url,
        css_content: final_css,
        cached: false,
    })
}

#[tauri::command]
pub fn get_downloaded_google_fonts(app: tauri::AppHandle) -> Result<Vec<DownloadedFontEntry>, String> {
    use tauri::Manager;
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let manifest_path = app_data.join("fonts").join("manifest.json");

    if !manifest_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
    let entries: Vec<DownloadedFontEntry> = serde_json::from_str(&content).unwrap_or_default();

    // Verify files still exist on disk
    let valid_entries = entries
        .into_iter()
        .filter(|e| app_data.join("fonts").join(&e.slug).join("font.css").exists())
        .collect();

    Ok(valid_entries)
}

#[tauri::command]
pub fn delete_downloaded_google_font(app: tauri::AppHandle, slug: String) -> Result<(), String> {
    use tauri::Manager;
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let font_dir = app_data.join("fonts").join(&slug);
    if font_dir.exists() {
        let _ = fs::remove_dir_all(font_dir);
    }

    let manifest_path = app_data.join("fonts").join("manifest.json");
    if manifest_path.exists() {
        if let Ok(content) = fs::read_to_string(&manifest_path) {
            if let Ok(mut entries) = serde_json::from_str::<Vec<DownloadedFontEntry>>(&content) {
                entries.retain(|e| e.slug != slug);
                if let Ok(serialized) = serde_json::to_string_pretty(&entries) {
                    let _ = fs::write(&manifest_path, serialized);
                }
            }
        }
    }

    Ok(())
}
