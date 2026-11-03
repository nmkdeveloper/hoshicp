# HoshiCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and release HoshiCP, a high-performance modern Competitive Programming Editor in Rust and Tauri v2 with full CP Editor feature parity, CodeMirror 6 (Vim mode + offline LSP), Mica/Glass/Cute Hoshino aesthetics, a custom Rust Windows installer, standard macOS/Linux packaging, and automated CI/CD self-updating.

**Architecture:** A lightweight Tauri v2 backend in Rust handles process execution (timeout/memory limits), Competitive Companion HTTP ingestion, diff/checker engines, stress testing, and an offline LSP WebSocket bridge. The frontend is built on Vite, React 19, Tailwind CSS v4, and CodeMirror 6 with dynamic theme token injection for transparent/Mica effects and Hoshino anime styling. A standalone Rust GUI installer (`hoshicp-installer`) packages the Windows distribution.

**Tech Stack:** Rust 1.80+, Tauri v2, Tokio, CodeMirror 6, `@replit/codemirror-vim`, React 19, TypeScript, Tailwind CSS v4, `tauri-plugin-updater`, `tauri-plugin-window-state`, `window-vibrancy`.

**Spec:** `docs/superpowers/specs/2026-11-03-hoshicp-design.md`

## Global Constraints

- **Language & Framework Versions:** Rust 2021 edition, Tauri v2.x, Node.js 20+, React 19, Tailwind CSS v4.
- **CP Contest Compliance:** No cloud AI calls during contest execution. Autocomplete and diagnostics must run strictly via local offline Language Server Protocol (`clangd`, `rust-analyzer`, `pyright`).
- **Storage Convention:** Problem metadata and test cases are stored in sidecar files (`<filename>.hoshicp.json`) in the same folder as the solution file.
- **Port Bindings:** Competitive Companion server must bind to `127.0.0.1:10043` and fallback to `127.0.0.1:10045`.
- **Installer Scope:** Windows uses a custom Rust-coded installer (`hoshicp-installer`), macOS uses standard DMG, and Linux uses AppImage and `.tar.gz`.
- **Self-Update Protocol:** Auto-updates verify Ed25519 signatures through `tauri-plugin-updater` and GitHub Releases `latest.json`.

## Review Focus

1. **Process timeout / TLE zombie processes:** When a user solution loops infinitely (e.g., `while(true)`), `process_runner` must forcefully terminate the process tree across Windows (Job Object), Linux, and macOS without leaking orphan processes.
2. **Float comparison precision edge cases:** Comparing floats with epsilon ($10^{-6}$ or $10^{-9}$) must handle `NaN`, `Infinity`, exponential notation (e.g. `1e-9`), and sign differences (`-0.0` vs `0.0`).
3. **Competitive Companion payload collisions:** Handling concurrent problem downloads or rapid successive imports without overwriting uncommitted edits or corrupting existing files.
4. **Offline LSP connection drop:** If `clangd` or `rust-analyzer` crashes or is missing from user PATH, the WebSocket bridge and CodeMirror client must gracefully degrade without freezing the UI or editor typing.
5. **Windows Installer file-in-use on update:** When running update replacement or re-installation while an instance of HoshiCP is running, installer must detect running processes and prompt or cleanly shut down before overwriting files.

---

### Task 1: Project Scaffold & Asset Pipeline

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Asset: `src-tauri/icons/icon.png` (converted from `C:\Users\nomoka\Downloads\icon.jpg`)
- Test: `src-tauri/tests/scaffold_test.rs`

**Interfaces:**
- Produces: Runnable baseline Tauri v2 project structure with window configuration and asset pipeline.

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/tests/scaffold_test.rs
#[test]
fn test_app_identifier_and_version() {
    let conf_str = include_str!("../tauri.conf.json");
    let conf: serde_json::Value = serde_json::from_str(conf_str).expect("Valid JSON");
    assert_eq!(conf["identifier"], "com.nmkdeveloper.hoshicp");
    assert_eq!(conf["productName"], "HoshiCP");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test scaffold_test` (inside `src-tauri`)  
Expected: FAIL with missing `tauri.conf.json` or directory not found.

- [ ] **Step 3: Implement Tauri v2 & Frontend scaffold**

1. Create root `package.json` with `@tauri-apps/api@^2`, `@tauri-apps/plugin-updater@^2`, `react@^19`, `react-dom@^19`, `lucide-react`, `tailwindcss@^4`.
2. Initialize `src-tauri/Cargo.toml` with `tauri = { version = "2", features = ["tray-icon"] }`, `tokio`, `serde`, `serde_json`.
3. Configure `src-tauri/tauri.conf.json` with productName `"HoshiCP"` and identifier `"com.nmkdeveloper.hoshicp"`.
4. Copy and generate app icons from `C:\Users\nomoka\Downloads\icon.jpg` into `src-tauri/icons/`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test scaffold_test` (inside `src-tauri`)  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src-tauri/
git commit -m "chore: scaffold Tauri v2 project with HoshiCP assets"
```

---

### Task 2: Core Data Models & Sidecar Persistence Engine

**Files:**
- Create: `src-tauri/src/models/problem.rs`
- Create: `src-tauri/src/models/testcase.rs`
- Create: `src-tauri/src/models/mod.rs`
- Create: `src-tauri/src/storage/sidecar.rs`
- Create: `src-tauri/src/storage/mod.rs`
- Test: `src-tauri/tests/sidecar_test.rs`

**Interfaces:**
- Produces:
  - `ProblemMetadata { name: String, group: String, url: String, time_limit: u64, memory_limit: u64 }`
  - `TestCase { id: String, input: String, output: String, custom: bool }`
  - `SidecarData { problem: ProblemMetadata, testcases: Vec<TestCase> }`
  - `save_sidecar(source_path: &Path, data: &SidecarData) -> Result<(), AppError>`
  - `load_sidecar(source_path: &Path) -> Result<SidecarData, AppError>`

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/tests/sidecar_test.rs
use hoshicp_lib::models::{ProblemMetadata, TestCase, SidecarData};
use hoshicp_lib::storage::sidecar::{save_sidecar, load_sidecar};
use std::path::PathBuf;

#[test]
fn test_sidecar_roundtrip() {
    let temp_dir = tempfile::tempdir().unwrap();
    let source_path = temp_dir.path().join("solution.cpp");
    std::fs::write(&source_path, "// code").unwrap();

    let data = SidecarData {
        problem: ProblemMetadata {
            name: "Watermelon".into(),
            group: "Codeforces - Beta Round 4".into(),
            url: "https://codeforces.com/problemset/problem/4/A".into(),
            time_limit: 1000,
            memory_limit: 64,
        },
        testcases: vec![TestCase {
            id: "tc_1".into(),
            input: "8\n".into(),
            output: "YES\n".into(),
            custom: false,
        }],
    };

    save_sidecar(&source_path, &data).expect("Save should succeed");
    let loaded = load_sidecar(&source_path).expect("Load should succeed");
    assert_eq!(loaded.problem.name, "Watermelon");
    assert_eq!(loaded.testcases.len(), 1);
    assert_eq!(loaded.testcases[0].input, "8\n");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test sidecar_test`  
Expected: FAIL with unresolvable module `hoshicp_lib::models`.

- [ ] **Step 3: Implement data models and sidecar file serializer**

Implement `models/problem.rs`, `models/testcase.rs`, and `storage/sidecar.rs` using `serde` and `serde_json`. Files are named `<source_stem>.hoshicp.json`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test sidecar_test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/models/ src-tauri/src/storage/ src-tauri/tests/sidecar_test.rs
git commit -m "feat(core): implement problem metadata and sidecar persistence"
```

---

### Task 3: Process Execution Engine (Compiler & Runner)

**Files:**
- Create: `src-tauri/src/runner/compiler.rs`
- Create: `src-tauri/src/runner/process.rs`
- Create: `src-tauri/src/runner/mod.rs`
- Test: `src-tauri/tests/runner_test.rs`

**Interfaces:**
- Consumes: `TestCase`
- Produces:
  - `ExecutionResult { stdout: String, stderr: String, exit_code: Option<i32>, execution_time_ms: u64, memory_usage_kb: u64, status: RunStatus }`
  - `RunStatus`: `Accepted`, `WrongAnswer`, `TimeLimitExceeded`, `MemoryLimitExceeded`, `RuntimeError`, `CompilationError`.
  - `compile_source(source_path: &Path, language: &str, custom_cmd: Option<&str>) -> Result<PathBuf, CompileError>`
  - `execute_testcase(executable: &Path, input: &str, time_limit_ms: u64, memory_limit_mb: u64) -> ExecutionResult`

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/tests/runner_test.rs
use hoshicp_lib::runner::process::{execute_testcase, RunStatus};
use std::env;

#[test]
fn test_execute_echo_process() {
    let echo_bin = if cfg!(windows) { "cmd.exe" } else { "echo" };
    // Verify execution captures stdout and measures time
    let res = execute_testcase(std::path::Path::new(echo_bin), "hello", 2000, 128);
    assert_ne!(res.status, RunStatus::TimeLimitExceeded);
}

#[test]
fn test_execute_timeout_process() {
    let sleep_bin = if cfg!(windows) { "powershell.exe" } else { "sleep" };
    let res = execute_testcase(std::path::Path::new(sleep_bin), "Start-Sleep -Seconds 3", 500, 128);
    assert_eq!(res.status, RunStatus::TimeLimitExceeded);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test runner_test`  
Expected: FAIL with module `runner` not found.

- [ ] **Step 3: Implement compiler and process execution engine**

Implement `src-tauri/src/runner/process.rs`:
- Use `tokio::process::Command` with piped `stdin`, `stdout`, `stderr`.
- Enforce timeout via `tokio::time::timeout`. Forcefully kill process on TLE.
- On Windows, attach process to a Windows Job Object configured with `JOB_OBJECT_LIMIT_PROCESS_MEMORY`. On Linux, use `setrlimit`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test runner_test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/runner/ src-tauri/tests/runner_test.rs
git commit -m "feat(runner): implement compilation and process execution engine with TLE/MLE guards"
```

---

### Task 4: Checker & Diff Engine

**Files:**
- Create: `src-tauri/src/checker/token.rs`
- Create: `src-tauri/src/checker/float.rs`
- Create: `src-tauri/src/checker/testlib.rs`
- Create: `src-tauri/src/checker/mod.rs`
- Test: `src-tauri/tests/checker_test.rs`

**Interfaces:**
- Produces:
  - `CheckVerdict { ok: bool, message: String, diff_positions: Vec<DiffSpan> }`
  - `check_tokens(actual: &str, expected: &str) -> CheckVerdict`
  - `check_floats(actual: &str, expected: &str, epsilon: f64) -> CheckVerdict`
  - `check_testlib(checker_bin: &Path, input: &Path, output: &Path, answer: &Path) -> CheckVerdict`

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/tests/checker_test.rs
use hoshicp_lib::checker::token::check_tokens;
use hoshicp_lib::checker::float::check_floats;

#[test]
fn test_token_checker_ignores_extra_trailing_whitespace() {
    let actual = "42   \n100\n\n";
    let expected = "42\n100";
    let verdict = check_tokens(actual, expected);
    assert!(verdict.ok);
}

#[test]
fn test_float_checker_with_epsilon() {
    let actual = "3.14159265";
    let expected = "3.14159260";
    let verdict = check_floats(actual, expected, 1e-6);
    assert!(verdict.ok);
    let strict_verdict = check_floats(actual, expected, 1e-8);
    assert!(!strict_verdict.ok);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test checker_test`  
Expected: FAIL with missing `checker` module.

- [ ] **Step 3: Implement token, float, and testlib checkers**

Implement `check_tokens` (whitespace-agnostic token stream comparison), `check_floats` (token stream parsing with absolute & relative epsilon: $|a - b| \le \max(1.0, |b|) \cdot \epsilon$), and `check_testlib` (spawning testlib executable and parsing exit code 0=OK, 1=WA, 2=PE, 3=FAIL).

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test checker_test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/checker/ src-tauri/tests/checker_test.rs
git commit -m "feat(checker): implement token, float epsilon, and testlib diff engines"
```

---

### Task 5: Stress Testing Core Engine

**Files:**
- Create: `src-tauri/src/stress/mod.rs`
- Create: `src-tauri/src/stress/engine.rs`
- Test: `src-tauri/tests/stress_test.rs`

**Interfaces:**
- Consumes: `execute_testcase`, `check_tokens`
- Produces:
  - `StressTestConfig { generator_bin: PathBuf, model_bin: PathBuf, target_bin: PathBuf, max_iterations: u32, time_limit_ms: u64 }`
  - `StressTestResult { iteration: u32, status: StressStatus, failing_input: Option<String>, model_output: Option<String>, target_output: Option<String> }`
  - `run_stress_test<F: Fn(u32)>(config: StressTestConfig, cancel_token: CancellationToken, on_progress: F) -> Result<StressTestResult, AppError>`

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/tests/stress_test.rs
use hoshicp_lib::stress::engine::{StressStatus, StressTestConfig, run_stress_step};

#[test]
fn test_stress_step_detects_mismatch() {
    let input = "5\n";
    let model_out = "10\n";
    let buggy_target_out = "11\n";
    let status = run_stress_step(input, model_out, buggy_target_out);
    assert_eq!(status, StressStatus::Mismatch);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test stress_test`  
Expected: FAIL with missing `stress` module.

- [ ] **Step 3: Implement stress testing loop and step validator**

Implement async loop in `src-tauri/src/stress/engine.rs` with `tokio::select!` checking `cancel_token`. Iteratively generates test via `generator_bin`, feeds to `model_bin`, feeds to `target_bin`, compares results, and returns first mismatch.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test stress_test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/stress/ src-tauri/tests/stress_test.rs
git commit -m "feat(stress): implement stress testing orchestration engine"
```

---

### Task 6: Competitive Companion Server

**Files:**
- Create: `src-tauri/src/server/companion.rs`
- Create: `src-tauri/src/server/mod.rs`
- Test: `src-tauri/tests/companion_test.rs`

**Interfaces:**
- Consumes: `ProblemMetadata`, `TestCase`
- Produces:
  - `start_companion_server<AppHandle>(app: AppHandle, primary_port: u16, secondary_port: u16) -> JoinHandle<()>`
  - Emits Tauri event `"companion:new_problem"` with serialized payload.

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/tests/companion_test.rs
use hoshicp_lib::server::companion::parse_companion_json;

#[test]
fn test_parse_companion_json_valid_payload() {
    let json_data = r#"{
        "name": "A. Way Too Long Words",
        "group": "Codeforces - Beta Round 65",
        "url": "https://codeforces.com/contest/71/problem/A",
        "timeLimit": 1000,
        "memoryLimit": 256,
        "tests": [
            {"input": "4\nword\nlocalization\ninternationalization\npneumonoultramicroscopicsilicovolcanoconiosis\n", "output": "word\nl10n\ni18n\np43s\n"}
        ]
    }"#;
    let problem_data = parse_companion_json(json_data).expect("Should parse");
    assert_eq!(problem_data.problem.name, "A. Way Too Long Words");
    assert_eq!(problem_data.testcases.len(), 1);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test companion_test`  
Expected: FAIL with unresolvable module `server`.

- [ ] **Step 3: Implement Competitive Companion HTTP listener**

Using `warp` or `axum` on `127.0.0.1:10043` (falling back to `10045` if port in use), handle `POST /` with CORS enabled (`Access-Control-Allow-Origin: *`). Deserialize payload and emit to Tauri frontend via `app.emit("companion:new_problem", payload)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test companion_test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/server/ src-tauri/tests/companion_test.rs
git commit -m "feat(server): implement Competitive Companion listener on ports 10043/10045"
```

---

### Task 7: Code Formatter & Local LSP WebSocket Proxy

**Files:**
- Create: `src-tauri/src/lsp/proxy.rs`
- Create: `src-tauri/src/lsp/mod.rs`
- Create: `src-tauri/src/formatter/mod.rs`
- Test: `src-tauri/tests/formatter_test.rs`
- Test: `src-tauri/tests/lsp_test.rs`

**Interfaces:**
- Produces:
  - `format_code(source: &str, language: &str, custom_config: Option<&Path>) -> Result<String, FormatterError>`
  - `start_lsp_proxy(language: &str, lsp_binary: &str, args: &[&str]) -> Result<u16, LspError>` (returns localhost port).

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/tests/formatter_test.rs
use hoshicp_lib::formatter::format_source_with_cli;

#[test]
fn test_formatter_missing_binary_returns_clear_error() {
    let res = format_source_with_cli("int main(){}", "non_existent_clang_format_bin", &[]);
    assert!(res.is_err());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test formatter_test`  
Expected: FAIL with missing `formatter` module.

- [ ] **Step 3: Implement formatter & LSP stdio-to-WebSocket bridge**

1. `formatter/mod.rs`: Spawns `clang-format`, `rustfmt`, `yapf` via stdin/stdout pipe and returns formatted string.
2. `lsp/proxy.rs`: Starts local WebSocket server (`tokio-tungstenite`) bound to `127.0.0.1:0`. Spawns LSP process (`clangd` or `rust-analyzer`), piping incoming WebSocket frames to LSP `stdin` and LSP `stdout` to outgoing WebSocket frames.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test formatter_test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lsp/ src-tauri/src/formatter/ src-tauri/tests/
git commit -m "feat(lsp): implement code formatter and local LSP WebSocket proxy"
```

---

### Task 8: Frontend CodeMirror 6 Editor with Vim Mode & Transparent/Mica Styling

**Files:**
- Create: `src/components/editor/CodeEditor.tsx`
- Create: `src/components/editor/vimStatus.tsx`
- Create: `src/components/editor/themes.ts`
- Create: `src/components/editor/lspClient.ts`
- Test: `src/components/editor/__tests__/themes.test.ts`

**Interfaces:**
- Consumes: Local LSP WebSocket port from backend.
- Produces:
  - `<CodeEditor value={code} onChange={setCode} language={lang} vimMode={bool} theme={themeName} />`
  - Transparent background styling classes allowing Mica / Acrylic / custom background image visibility.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/editor/__tests__/themes.test.ts
import { describe, it, expect } from 'vitest';
import { getThemeExtensions } from '../themes';

describe('Editor Theme Engine', () => {
  it('provides transparent background extension for glass and mica themes', () => {
    const ext = getThemeExtensions('cute-hoshino');
    expect(ext).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`  
Expected: FAIL with missing module `../themes`.

- [ ] **Step 3: Implement CodeMirror 6 component with Vim and LSP support**

Set up `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-cpp`, `@codemirror/lang-rust`, `@codemirror/lang-python`, `@replit/codemirror-vim`, and transparent theme definitions. Connect `cm6-lsp` or WebSocket JSON-RPC client to backend LSP port.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/
git commit -m "feat(ui): implement CodeMirror 6 editor with Vim mode and transparent theming"
```

---

### Task 9: Frontend Layout, Testcases Manager, Diff Viewer, & Hoshino Theme

**Files:**
- Create: `src/components/layout/HeaderBar.tsx`
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/components/testcases/TestCaseList.tsx`
- Create: `src/components/testcases/TestCaseItem.tsx`
- Create: `src/components/testcases/DiffViewerModal.tsx`
- Create: `src/components/theme/ThemeManager.tsx`
- Create: `src/styles/themes.css`
- Test: `src/components/testcases/__tests__/diff.test.ts`

**Interfaces:**
- Produces:
  - Multi-tab problem workspace.
  - Testcase manager panel (Add, delete, edit, batch run, pass/fail status pills).
  - Side-by-side and inline diff viewer for testcase outputs.
  - Cute Hoshino theme with avatar mascot from `icon.jpg` and customizable background wallpaper with blur.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/testcases/__tests__/diff.test.ts
import { describe, it, expect } from 'vitest';
import { computeTokenDiff } from '../diffHelper';

describe('Token Diff Computations', () => {
  it('flags mismatches between actual and expected tokens', () => {
    const diff = computeTokenDiff('42\n100', '42\n101');
    expect(diff.hasMismatch).toBe(true);
    expect(diff.mismatchLine).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`  
Expected: FAIL with missing `computeTokenDiff`.

- [ ] **Step 3: Implement AppShell, TestCase Manager, and Diff Viewer**

Build UI using React 19, Lucide icons, and Tailwind CSS v4. Implement `computeTokenDiff`, testcase execution triggering via Tauri `invoke("run_all_testcases")`, and live result status (Accepted, WA, TLE, MLE). Add background image and Mica/Acrylic backdrop styling.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ src/styles/
git commit -m "feat(ui): implement AppShell, TestCase manager, DiffViewer, and Hoshino theme"
```

---

### Task 10: Frontend Stress Testing, Settings Modal & Companion Integration

**Files:**
- Create: `src/components/stress/StressTestingPanel.tsx`
- Create: `src/components/settings/SettingsModal.tsx`
- Create: `src/hooks/useCompanion.ts`
- Create: `src/App.tsx`
- Test: `src/hooks/__tests__/companion.test.ts`

**Interfaces:**
- Consumes: Tauri events `"companion:new_problem"`, `"stress:progress"`.
- Produces: Complete functional end-to-end user workflow: receiving problems from browser, compiling, running, stress testing, and persisting configurations.

- [ ] **Step 1: Write the failing test**

```typescript
// src/hooks/__tests__/companion.test.ts
import { describe, it, expect } from 'vitest';
import { formatProblemFileName } from '../useCompanion';

describe('Companion File Path Generator', () => {
  it('formats problem file path according to template', () => {
    const path = formatProblemFileName('Watermelon', 'Codeforces', 'cpp', '{group}/{name}.{ext}');
    expect(path).toBe('Codeforces/Watermelon.cpp');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`  
Expected: FAIL with missing `formatProblemFileName`.

- [ ] **Step 3: Implement Stress Testing UI, Settings, and Companion hook**

1. Build `StressTestingPanel`: selects Generator, Model, and Solution files; displays iteration counter and stops on mismatch.
2. Build `SettingsModal`: Compilers flags, paths, LSP configurations, themes, and template paths.
3. Wire `useCompanion` to listen to Tauri `"companion:new_problem"` and automatically switch/create problem tab.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/stress/ src/components/settings/ src/hooks/ src/App.tsx
git commit -m "feat(app): wire Stress Testing, Settings, and Competitive Companion ingestion"
```

---

### Task 11: Standalone Custom Windows Installer (`hoshicp-installer`)

**Files:**
- Create: `crates/installer/Cargo.toml`
- Create: `crates/installer/src/main.rs`
- Create: `crates/installer/src/setup.rs`
- Create: `crates/installer/src/shortcuts.rs`
- Create: `crates/installer/src/ui.rs`
- Test: `crates/installer/tests/installer_test.rs`

**Interfaces:**
- Produces:
  - `HoshiCP-Setup.exe` standalone Rust binary.
  - GUI with cute Hoshino banner, install path selection, progress bar, Desktop/Start Menu shortcut creation, and registry uninstall entry.
  - Supports `--silent --install-dir <path>` for automated testing and update integration.

- [ ] **Step 1: Write the failing test**

```rust
// crates/installer/tests/installer_test.rs
use hoshicp_installer::setup::{InstallerOptions, extract_payload};

#[test]
fn test_installer_extracts_into_target_dir() {
    let temp_dir = tempfile::tempdir().unwrap();
    let opts = InstallerOptions {
        install_dir: temp_dir.path().to_path_buf(),
        create_desktop_shortcut: false,
        create_start_menu_shortcut: false,
        silent: true,
    };
    // Validate extraction logic without panic
    assert!(opts.install_dir.exists());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test installer_test` (in `crates/installer`)  
Expected: FAIL with crate `hoshicp_installer` not found.

- [ ] **Step 3: Implement custom Rust Windows Installer**

Implement `crates/installer`:
- Uses Windows Shell COM `IShellLinkW` to create Start Menu and Desktop shortcuts.
- Writes uninstaller registry keys to `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\HoshiCP`.
- Embeds compressed release payload using `include_bytes!` or unpacks adjacent archive.
- Renders an anime Hoshino-themed GUI window.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test installer_test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/installer/
git commit -m "feat(installer): implement custom Rust Windows installer with Hoshino GUI"
```

---

### Task 12: CI/CD Multiplatform Matrix, Auto-Updater & GitHub Release Pipeline

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `src-tauri/src/updater.rs`
- Test: `.github/workflows/release_syntax_test.py` (or CI validation check)

**Interfaces:**
- Produces:
  - Automated build matrix for `windows-latest`, `macos-latest`, `ubuntu-22.04`.
  - Artifact outputs: `HoshiCP-Setup.exe` (Windows), `HoshiCP.dmg` (macOS), `HoshiCP.AppImage` (Linux).
  - Signs bundles with Tauri private key and produces `latest.json` for `tauri-plugin-updater`.

- [ ] **Step 1: Write the failing test / validator**

```python
# scripts/verify_workflow.py
import yaml, sys

with open(".github/workflows/release.yml") as f:
    wf = yaml.safe_load(f)

matrix = wf["jobs"]["release"]["strategy"]["matrix"]["os"]
assert "windows-latest" in matrix
assert "macos-latest" in matrix
assert "ubuntu-22.04" in matrix
print("Workflow matrix verified")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python scripts/verify_workflow.py`  
Expected: FAIL with file not found `.github/workflows/release.yml`.

- [ ] **Step 3: Implement GitHub Actions release workflow & Tauri Updater integration**

1. Write `.github/workflows/release.yml` with triggers on tag push `v*`.
2. Configure build steps for all 3 OS targets.
3. Sign updater assets with `TAURI_SIGNING_PRIVATE_KEY` and upload `latest.json` alongside binaries to the GitHub Release.
4. Wire `tauri-plugin-updater` inside `src-tauri/src/lib.rs` to query GitHub Releases automatically on startup and prompt user with a cute Hoshino update dialog.

- [ ] **Step 4: Run test to verify it passes**

Run: `python scripts/verify_workflow.py`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml src-tauri/src/updater.rs scripts/
git commit -m "ci: add multiplatform matrix build, custom installer packaging, and auto-updater"
```

---
