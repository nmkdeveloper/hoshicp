# HoshiCP

<div align="center">

<img src="public/icon.png" width="140" alt="HoshiCP Logo" style="border-radius: 50%;" />

### Modern, Cute & Lightning-Fast Competitive Programming IDE

*Built with Rust, Tauri v2, React 19, Tailwind CSS v4, and CodeMirror 6.*  
*Inspired by CP Editor, infused with Blue Archive Hoshino charm and modern desktop aesthetics.*

[![Release](https://img.shields.io/github/v/release/nmkdeveloper/hoshicp?style=flat-square&color=ff70a0)](https://github.com/nmkdeveloper/hoshicp/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-24c8db?style=flat-square&logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-orange?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)

[Features](#key-features) • [Installation](#installation) • [Shortcuts](#keyboard-shortcuts) • [Building](#building-from-source) • [Contributing](#contributing)

</div>

---

## Overview

**HoshiCP** is a next-generation editor designed specifically for competitive programmers. While inheriting the core functionality and workflows of **CP Editor**, HoshiCP re-architects the entire experience with a blazingly fast **Rust (Tauri v2)** backend and an ultra-responsive **CodeMirror 6** frontend.

Say goodbye to heavy memory footprints and clunky UIs. HoshiCP gives you instant launch times (<100MB RAM), native Windows 11 Mica and Glassmorphism effects, customizable anime wallpaper backdrops, offline LSP code completion (clangd, rust-analyzer, pyright), seamless Competitive Companion ingestion, and robust process execution guards (TLE, MLE, RE detection).

---

## Key Features

### 🌸 Aesthetic Excellence & Theming
- **Cute Hoshino Theme**: Signature pastel pink (`#ffb6c1`) and periwinkle blue (`#70a1ff`) palette with subtle mascot watermarks.
- **Glassmorphic & Mica Window Effects**: Frameless window design supporting Windows 11 Mica, macOS Vibrancy, and frosted acrylic code surfaces that keep code crisp and readable without see-through text bleed.
- **Custom Wallpaper**: Load your own custom background image with adjustable blur and opacity sliders.
- **Classic Themes**: Includes Classic Dark, Classic Light, Dracula, One Dark, and Catppuccin.

### ⚡ Code Editor & High-Performance Tools
- **CodeMirror 6 Engine**: Ultra-fast virtualized text editor supporting C++, Python, Rust, and Java.
- **Dynamic Pre-allocated Lines**: Gutter lines always extend to the bottom of the viewport (even on 2K/1440p and 4K displays).
- **Zero Dirty Lines on Save**: Automatically strips trailing empty padding lines upon save, compile, or run. What you save to disk is 100% clean, standard code.
- **Clean Code Copy Button**: 1-click toolbar button to copy clean stripped source code to your clipboard ready for browser contest submissions.
- **Vim Mode**: Full Vim emulation via `@replit/codemirror-vim` with visual status bar indicators.
- **CodeBlocks Multi-Cursor (`Ctrl + E` / `Ctrl + D`)**: Select the next occurrence of a word or variable to edit multiple positions simultaneously.
- **Full Find & Replace (`Ctrl + F` / `Ctrl + H`)**: In-editor search panel with regex support, case-matching, and Replace All.
- **Customizable Indentation & Tab Size**: Configure 2, 4, or 8 spaces, tabs vs spaces, and autocomplete accept keys (Tab, Enter, or both).
- **Offline Language Server Protocol (LSP)**: Integrated local WebSocket bridge connecting to `clangd`, `rust-analyzer`, and `pyright` for contest-legal autocomplete and inline diagnostics.

### 🧪 Test Cases, Checkers & Runtime Diagnostics
- **Batch Testcase Runner**: Run individual test cases or all cases in parallel with precise execution time (ms) and peak memory (KB) measurements.
- **TLE & MLE Process Protection**: Windows Job Objects and Unix process groups kill runaway loops (`while(true)`) instantly without leaving zombie processes.
- **Hidden Console Windows**: Background compiler and execution processes run with `CREATE_NO_WINDOW`, eliminating flashing black cmd windows.
- **Detailed Runtime Error (RE) Reporting**: When a solution segfaults, divides by zero, or crashes, a prominent red diagnostic card displays the exact Exit Code and `stderr` crash stack trace.
- **Direct Run without Testcases**: Click Run or Compile & Run on an empty testcase list to execute your program directly, streaming output to the integrated Console drawer.
- **Smart Multi-File Testcase Import**:
  - Open multiple test files at once (`.in`, `.out`, `.ans`, `.txt`, `.json`, `.cpe`).
  - Automatically matches and pairs inputs with outputs by file name (e.g., `1.in` paired with `1.out`, `input_01.txt` with `output_01.txt`).
- **Interactive Diff Viewer**: Side-by-side and unified diff inspection highlighting token and line-level mismatches with configurable float epsilon ($10^{-6}, 10^{-9}$) and `testlib.h` checker compatibility.

### 🌐 Competitive Companion Integration
- Embedded background HTTP server listening on ports `10043` and `10045`.
- 1-click import from Codeforces, AtCoder, CSES, LeetCode, CodeChef, and all platforms supported by the Competitive Companion browser extension.
- Automatically generates problem files using customizable path templates (e.g., `{group}/{name}.{ext}`) pre-filled with your custom starter template code.

### 📦 Seamless Distribution & Auto-Updates
- **Custom Windows Installer (`crates/installer`)**: A standalone Win32 GUI installer written in Rust featuring Hoshino styling, automatic Desktop & Start Menu shortcut generation, safe uninstallation, and headless `--silent` installation.
- **Multi-Platform Releases**: Pre-built packages for Windows (`.exe` installer & portable `.zip`), macOS (`.dmg`), and Linux (`.AppImage` & `.tar.gz`).
- **Cryptographic Self-Updating**: Integrated `tauri-plugin-updater` checking GitHub Releases with Ed25519 digital signature verification.

---

## Keyboard Shortcuts

| Shortcut | Action |
|:---|:---|
| **Ctrl + S** / **Cmd + S** | Save source code (updates tab title with file name and extension) |
| **Ctrl + O** / **Cmd + O** | Open source code file from disk into a new tab |
| **Ctrl + E** / **Ctrl + D** | Select next matching occurrence (multi-cursor selection, CodeBlocks style) |
| **Ctrl + F** | Open Find panel in code editor |
| **Ctrl + H** | Open Replace panel in code editor |
| **Ctrl + F5** | Compile & Run all test cases |
| **F5** | Run all test cases without recompiling |
| **Shift + F5** | Forcefully stop running execution |
| **Ctrl + ,** | Open Preferences / Settings Modal |

---

## Installation

Download the latest release for your platform from the [Releases Page](https://github.com/nmkdeveloper/hoshicp/releases).

### Windows
- **Installer**: Download and run `HoshiCP-Setup.exe`.
- **Portable**: Download `HoshiCP-windows-x64.zip`, extract anywhere, and run `HoshiCP.exe`.

### macOS
- Download `HoshiCP.dmg`, open the disk image, and drag `HoshiCP.app` to your `Applications` folder.

### Linux
- Download `HoshiCP.AppImage`, make it executable, and run:
  ```bash
  chmod +x HoshiCP.AppImage
  ./HoshiCP.AppImage
  ```

---

## Building from Source

### Prerequisites
1. **Node.js**: v20 or newer (`node -v`, `npm -v`).
2. **Rust**: v1.80 or newer with Cargo (`rustc --version`).
3. **C++ Compiler** (optional, for compiling user solutions): `g++` or `clang++`.
4. **Linux only**: WebKit2GTK and development libraries:
   ```bash
   sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
   ```

### 1. Clone the Repository
```bash
git clone https://github.com/nmkdeveloper/hoshicp.git
cd hoshicp
```

### 2. Install Frontend Dependencies
```bash
npm install
```

### 3. Run in Development Mode
```bash
npm run tauri dev
```

### 4. Run Automated Test Suites
```bash
# Frontend Unit Tests (Vitest)
npm test

# Backend Tests (Rust)
cargo test --manifest-path src-tauri/Cargo.toml

# Windows Installer Tests (Rust)
cargo test --manifest-path crates/installer/Cargo.toml
```

### 5. Build Standalone Production Binaries
```bash
# 1. Build frontend and package standalone Tauri desktop app
npm run tauri -- build --no-bundle

# 2. Build custom Windows installer (Windows runner)
cargo build --release --manifest-path crates/installer/Cargo.toml
```
Compiled executables will be available at:
- `src-tauri/target/release/hoshicp.exe`
- `crates/installer/target/release/HoshiCP-Setup.exe`

---

## Architecture

```
hoshicp/
├── src/                          # Frontend (React 19 + TypeScript + Tailwind v4)
│   ├── components/
│   │   ├── editor/               # CodeMirror 6, Vim mode, LSP client, themes
│   │   ├── layout/               # HeaderBar, AppShell, tabs, window frame
│   │   ├── settings/             # SettingsModal, preferences persistence
│   │   ├── testcases/            # TestCaseList, DiffViewerModal, multi-file parser
│   │   └── theme/                # ThemeManager, Mica & wallpaper context
│   └── hooks/                    # useCompanion (Competitive Companion listener)
├── src-tauri/                    # Core Tauri v2 Backend (Rust)
│   ├── src/
│   │   ├── checker/              # Token diff, float with epsilon, testlib runner
│   │   ├── commands.rs           # Tauri IPC commands & native file dialogs (rfd)
│   │   ├── formatter/            # clang-format, rustfmt, black wrappers
│   │   ├── lsp/                  # Stdio-to-WebSocket local proxy bridge
│   │   ├── runner/               # Compiler & Process runner with TLE/MLE guards
│   │   ├── server/               # Competitive Companion Axum HTTP server (ports 10043/10045)
│   │   ├── storage/              # Problem & testcase sidecar persistence (.hoshicp.json)
│   │   └── updater.rs            # Tauri v2 updater integration
│   └── tauri.conf.json           # Tauri v2 configuration
├── crates/installer/             # Custom standalone Windows Installer (Rust Win32 GUI)
└── .github/workflows/            # GitHub Actions CI/CD matrix build for Windows, macOS, Linux
```

---

## Contributing

Contributions, bug reports, and pull requests are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details on our code standards and pull request process.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

*HoshiCP is an independent open-source project inspired by [CP Editor](https://github.com/cpeditor/cpeditor). Blue Archive and Hoshino are trademarks and copyrights of NEXON Games Co., Ltd. & Yostar, Inc.*
