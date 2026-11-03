# HoshiCP System Design Document

**Document Version:** 1.0.0  
**Date:** 2026-11-03  
**Status:** In Review  
**Topic:** HoshiCP - Modern Competitive Programming Editor (Rust + Tauri v2)

---

## 1. Intent & The Why

Competitive Programming (CP) requires speed, reliability, and precision. The existing open-source tool **CP Editor** (built in C++ and Qt5/Qt6) is functional and widely respected, but has accumulated legacy debt:
1. Clunky UI customizability with rigid styling limits (difficult to achieve modern Windows 11 Mica, macOS Vibrancy, custom glassmorphism, or anime aesthetics).
2. Heavy build requirements (C++ toolchain, Qt moc, external dependencies).
3. Complex installer and update setup across platforms.

**HoshiCP** is a complete, modern rewrite and evolution of CP Editor inspired by its architecture and full feature set, engineered with **Rust** and **Tauri v2** on the backend and **CodeMirror 6 + React + Tailwind CSS** on the frontend. It features a charming anime mascot theme (Hoshino from Blue Archive), rich visual customization (Mica, acrylic/glass, custom background images), offline LSP code completion (clangd, rust-analyzer, pyright), full Competitive Companion support, stress testing, testlib diff checking, a custom Windows installer written in Rust, standard macOS/Linux packages, and automated CI/CD self-updating.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **100% CP Editor Feature Parity**:
  - Embedded HTTP server listening on ports `10043` and `10045` for Competitive Companion browser extension.
  - Testcase management: add, remove, edit, batch run, manual input/output.
  - Multi-language compilation and execution: C++, Rust, Python, Java, with custom compiler flags and environment variables.
  - Execution guards: precise timeout (TLE detection) and memory usage monitoring (MLE detection).
  - Validation: Token-based diffing, float comparison with configurable epsilon ($10^{-6}, 10^{-9}$), and custom checker support (Testlib compatible).
  - Stress Testing: Generator, Brute Force (Correct Solution), and Target Solution automated loop until mismatch or crash.
  - Code Formatter: Integration with `clang-format`, `rustfmt`, `yapf`, `black`.
  - Code Completion: Offline Language Server Protocol (LSP) client connecting to local `clangd`, `rust-analyzer`, `pyright` for diagnostics, autocomplete, and hover documentation.
  - Editor modes: Standard and Vim mode (via `@replit/codemirror-vim`).
  - Template & Snippet management: Customizable file templates with variable placeholders (`${PROBLEM_NAME}`, `${DATE}`, etc.).
  - Problem binder: Associating source code files with testcases and problem metadata.
- **Aesthetic Excellence & Theming**:
  - CP Editor classic themes (Classic Light, Classic Dark, Monokai, Solarized).
  - Modern themes (Catppuccin Mocha/Latte, Tokyo Night, One Dark).
  - Cute Hoshino theme (pastel pink & sky blue accents, anime mascot avatar from `icon.jpg`, stylized status badges).
  - System integration: Windows 11 Mica / Acrylic, macOS Vibrancy, adjustable window opacity and custom user background images with backdrop filters.
- **Distribution & Maintenance**:
  - Custom Windows Installer coded in Rust (`hoshicp-installer`) with Hoshino-themed GUI, shortcut creation, registry management, and optional toolchain PATH setup.
  - Standard macOS package (`.dmg`) and Linux package (`.AppImage` and portable `.tar.gz`).
  - GitHub Actions CI/CD matrix compiling all 3 operating systems, signing binaries, and generating GitHub Releases.
  - Seamless self-update using Tauri v2 Updater plugin with Ed25519 signature verification.

### Non-Goals
- Cloud-based AI autocomplete (tab-nine / Copilot / LLM prompts) in the core build: User explicitly requested Level 1 (offline local LSP) to strictly respect contest rules (ICPC, Codeforces, IOI) where external AI assistance is prohibited.
- Building our own C++ compiler or re-implementing `testlib.h` from scratch: HoshiCP orchestrates the user's local standard toolchain (`g++`, `clang++`, `clangd`, `python`, `rustc`).

### Anti-Goals
- Heavy Electron memory bloat: Tauri v2 + CodeMirror 6 must maintain a lightweight footprint (<100MB idle RAM).
- Invasive installers on macOS/Linux: macOS Gatekeeper prohibits arbitrary custom installer executables without packaging. Standard DMG and AppImage will be used on non-Windows platforms.
- Fragile updater: We will not use makeshift process-killing shell scripts that fail on locked Windows `.exe` files. Tauri's native transactional updater handles in-place file replacement safely.

---

## 3. Approaches & Tradeoffs

| Component | Alternative Considered | Selected Approach | Tradeoff / Rationale |
|---|---|---|---|
| **Editor Core** | Monaco Editor | **CodeMirror 6** | Monaco is heavy (~10MB+ bundle, complex DOM) and difficult to make transparent/acrylic. CodeMirror 6 is modular (<500KB), fast, natively supports transparent themes/Mica backgrounds, and has official Vim + LSP bindings. |
| **Windows Installer** | NSIS / Inno Setup / WiX | **Custom Rust Installer** | User explicitly requested no off-the-shelf installers. We build a standalone Rust GUI installer with embedded assets, extracting the app, registering shortcuts, and presenting a cute themed onboarding experience. |
| **Non-Windows Packaging** | Custom shell/Rust installer | **Standard DMG (macOS) & AppImage (Linux)** | Avoids Apple Gatekeeper security rejections and Linux distro fragmentation while respecting the user's specification. |
| **Code Completion** | Cloud AI LLM / TabNine | **Local LSP Bridge (Level 1)** | Connects to `clangd` / `rust-analyzer` via stdio JSON-RPC. Complies with CP contest regulations, runs zero-latency offline. |
| **Auto-Updater** | Custom GitHub API downloader | **Tauri v2 Updater Plugin** | Cryptographically signed (Ed25519), zero hassle for end users, integrated with GitHub Actions releases (`latest.json`). |

---

## 4. System Architecture

```
+--------------------------------------------------------------------------------+
|                                HOSHICP FRONTEND                                |
|   (Vite + React 19 + TypeScript + Tailwind CSS v4 + CodeMirror 6 + Lucide)     |
+--------------------------------------------------------------------------------+
  |              |                |                 |                |
  | Editor View  | Testcase Panel | Stress Test Tab | Diff Viewer    | Settings & Themes
  | (Vim / CM6)  | (Status, TLE)  | (Brute, Gen)    | (Token/Float)  | (Mica, Hoshino, Bg)
  +--------------+----------------+-----------------+----------------+
                                  | (Tauri IPC via invoke / listen)
+---------------------------------v----------------------------------------------+
|                           TAURI V2 CORE (RUST BACKEND)                         |
+--------------------------------------------------------------------------------+
| 1. companion_server: Warp/Tokio HTTP server listening on 10043/10045           |
| 2. process_runner: Cross-platform process spawner with timeout & memory limit  |
| 3. checker: Token-by-token diff, float epsilon comparator, and testlib runner  |
| 4. stress_tester: Async test generation & solution comparison worker           |
| 5. lsp_proxy: Stdio JSON-RPC bridge between CodeMirror and clangd/rust-analyzer|
| 6. formatter: Spawner for clang-format, yapf, black, rustfmt                   |
| 7. config_store: Persistent settings, hotkeys, templates, problem mappings    |
| 8. window_effects: Tauri window vibrancy (Mica on Win11, Acrylic, Vibrancy)   |
| 9. updater: Tauri v2 update checker & installer verification                   |
+--------------------------------------------------------------------------------+
```

---

## 5. Detailed Component Specifications

### 5.1. Competitive Companion Listener (`companion_server`)
- Runs a lightweight HTTP server on `127.0.0.1:10043` and `127.0.0.1:10045`.
- Implements `POST /` parsing the Competitive Companion JSON schema:
  - `name`: Problem name.
  - `group`: Contest / Platform name (e.g. Codeforces, AtCoder).
  - `url`: Problem URL.
  - `timeLimit`: Time limit in milliseconds.
  - `memoryLimit`: Memory limit in megabytes.
  - `tests`: Array of `{ input: string, output: string }`.
- On receiving payload, emits a Tauri event to frontend: creates a new problem tab or binds to active file according to user settings.

### 5.2. Compilation and Process Runner (`process_runner`)
- Compiles source code with user-configured command (e.g., `g++ -O2 -std=c++20 "{file}" -o "{output}"`).
- Execution engine:
  - Spawns child process for each testcase.
  - Piped standard streams (`stdin`, `stdout`, `stderr`).
  - Timeout enforcement: `tokio::time::timeout` kills process and marks `TLE` (Time Limit Exceeded).
  - Memory limit monitoring:
    - Windows: `AssignProcessToJobObject` with `JOB_OBJECT_LIMIT_PROCESS_MEMORY`.
    - Linux: `rlimit` (via `libc::setrlimit`).
    - macOS: periodic check via `proc_pidinfo`.
  - Captures wall time and memory usage metrics.

### 5.3. Checker & Diff Engine (`checker`)
- **Default Whitespace / Token Checker**: Compares output and expected output ignoring trailing spaces and empty line differences.
- **Float Checker**: Compares numbers with configurable absolute/relative epsilon (e.g., $10^{-6}$ or $10^{-9}$).
- **Custom / Testlib Checker**: Compares output using compiled `testlib.h` checker:
  `./checker <input_file> <output_file> <answer_file>`.

### 5.4. Stress Testing Engine (`stress_tester`)
- Coordinates three programs:
  1. `Generator`: Generates randomized test inputs.
  2. `Brute Force (Model)`: Slower but known correct solution.
  3. `Candidate Solution`: The optimized solution under test.
- Orchestrates an async loop running iterations until:
  - Output mismatch detected.
  - Candidate TLE / RTE occurs.
  - User stops the test or target iteration count reached.
- On mismatch, automatically imports the failing test case into the Testcase manager with 1 click.

### 5.5. LSP Proxy (`lsp_proxy`)
- Manages lifecycle of local Language Server processes:
  - C/C++: `clangd`
  - Rust: `rust-analyzer`
  - Python: `pyright-langserver` / `pylsp`
- Architecture: Spawns an ephemeral localhost WebSocket server (`127.0.0.1:<random_port>`) managed by Tokio that bridges standard `vscode-ws-jsonrpc` from CodeMirror 6 directly to the LSP binary's `stdin`/`stdout`. This avoids custom IPC framing latency and allows drop-in integration with standard CodeMirror LSP plugins.
- Supports: Diagnostics (syntax errors/warnings displayed in editor gutter & underline), Auto-completion popup, Hover definitions, Format on save.

### 5.6. Problem & Testcase Persistence Model
- **Storage Strategy**:
  - Solution-bound sidecar files (`<filename>.hoshicp.json` or `.cpe` compatibility mode) stored alongside the source code file. This guarantees testcases, custom limits, and problem URLs travel with the source code under git or file transfer.
- **Competitive Companion Ingestion Flow**:
  - User defines a configurable path pattern (default: `~/HoshiCP/{group}/{name}.{ext}`).
  - When Competitive Companion emits a problem, HoshiCP applies the path template, creates the directory and file with the selected language template, generates the sidecar metadata/testcase file, and opens it directly in a new tab.

### 5.7. UI & Theming Architecture
- **Window Frame**:
  - Frameless window with custom titlebar supporting drag regions, minimize, maximize, close.
  - Integration with `tauri-plugin-window-state` and native vibration/Mica effects on Windows 11.
- **Theme System**:
  - CSS Custom Properties token design (`--hoshicp-bg`, `--hoshicp-fg`, `--hoshicp-accent`, `--hoshicp-border`, `--hoshicp-glass-opacity`).
  - Preset Themes:
    - Hoshino Cute (Pink `#ffb6c1`, Periwinkle `#70a1ff`, White/Navy, mascot badge, subtle watermark from `icon.jpg`).
    - CP Editor Classic Dark & Light.
    - Dracula, Tokyo Night, Catppuccin Mocha.
  - Custom Background Image support with opacity, blur slider, and background sizing (Cover/Contain).

### 5.8. Custom Windows Installer (`hoshicp-installer`)
- Standalone Rust binary built with a lightweight GUI (or embedded HTML WebView).
- Embeds compressed HoshiCP application payload (via `include_bytes!` or separate archive).
- Flow:
  1. Cute Hoshino welcoming screen with installation directory picker (`%LOCALAPPDATA%\Programs\HoshiCP` default, no admin rights required, or `Program Files` with UAC).
  2. Progress bar extracting files.
  3. Creates Desktop and Start Menu shortcuts (Windows Shell COM `IShellLinkW`).
  4. Creates uninstall registry entries in `Software\Microsoft\Windows\CurrentVersion\Uninstall\HoshiCP`.
  5. Supports `--silent` CLI flag for headless automated deployment and uninstaller hooks.
  6. Launches HoshiCP upon completion.

### 5.9. Multiplatform Build, Updater & CI/CD
- **Self-Update Mechanism**:
  - Uses `tauri-plugin-updater` v2 with Ed25519 signature verification against GitHub Releases `latest.json`.
  - Windows in-app auto-update downloads the signed portable package and safely executes in-place binary swapping on restart. First-time installations use `HoshiCP-Setup.exe`.
- GitHub Actions workflow (`.github/workflows/release.yml`):
  - Matrix: `windows-latest`, `macos-latest`, `ubuntu-22.04`.
  - Installs Rust, Node.js, WebKit2GTK (Linux).
  - Builds Tauri frontend & backend.
  - Compiles `hoshicp-installer` on Windows runner.
  - Signs packages using `TAURI_SIGNING_PRIVATE_KEY`.
  - Packages:
    - Windows: Custom Installer (`HoshiCP-Setup.exe`) + Portable Zip (`HoshiCP-windows-x64.zip`).
    - macOS: DMG image (`HoshiCP.dmg`).
    - Linux: AppImage (`HoshiCP.AppImage`) + `.tar.gz`.
  - Generates `latest.json` updater manifest and creates GitHub Release.

---

## 6. What's Left to the Builder
- Detailed CSS color values for each theme token palette.
- Default keyboard shortcut mapping configuration table.
- Exact regex pattern for float number parsing in the comparison engine.
- Minor UI micro-interactions (collapsible panel animations, icon sizing).

---
