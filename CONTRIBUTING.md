# Contributing to HoshiCP

Thank you for your interest in contributing to **HoshiCP**! Whether you are fixing bugs, proposing new features, improving documentation, or refining animations and themes, your contributions help make competitive programming faster and more delightful.

---

## Code of Conduct

All contributors and participants are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please treat everyone with respect and kindness.

---

## How Can I Contribute?

### 1. Reporting Bugs
- Check the [GitHub Issues](https://github.com/nmkdeveloper/hoshicp/issues) to verify if the issue has already been reported.
- If not, open a new issue using the **Bug Report** template.
- Include clear reproduction steps, operating system details (Windows, macOS, or Linux), and any relevant terminal/console logs.

### 2. Suggesting Features
- Open a new issue using the **Feature Request** template.
- Describe the motivation, what problem it solves in competitive programming, and how you envision the user experience.

### 3. Submitting Pull Requests
1. **Fork the repository** and create your branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Follow Code Standards**:
   - **Rust**: Use standard idiomatic Rust. Run `cargo fmt` and ensure `cargo clippy -- -D warnings` passes without warnings.
   - **Frontend**: Write clean TypeScript with React 19 and Tailwind CSS v4. Avoid arbitrary inline styles where CSS variables or Tailwind tokens exist.
   - **Testing**: Ensure all automated test suites pass before submitting:
     ```bash
     npm test
     cargo test --manifest-path src-tauri/Cargo.toml
     cargo test --manifest-path crates/installer/Cargo.toml
     ```
3. **Commit Messages**: Follow standard Conventional Commits:
   - `feat: add feature X`
   - `fix: resolve issue with Y`
   - `docs: update installation instructions`
   - `test: add unit test for Z`
4. **Push to your fork** and submit a Pull Request to `nmkdeveloper/hoshicp`'s `main` branch.

---

## Development Setup

### Local Prerequisites
- Node.js v20+ (`npm install`)
- Rust v1.80+ (`rustup update stable`)
- Visual Studio C++ Build Tools (Windows) or build-essential (Linux)

### Common Commands
- Run in development mode with live-reload:
  ```bash
  npm run tauri dev
  ```
- Run frontend unit tests:
  ```bash
  npm test
  ```
- Run Rust backend tests:
  ```bash
  cargo test --manifest-path src-tauri/Cargo.toml
  ```
- Lint Rust code with Clippy:
  ```bash
  cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
  ```
- Build standalone release binary:
  ```bash
  npm run tauri -- build --no-bundle
  ```

---

## Architecture Principles

- **Minimalist & Blazingly Fast**: The editor must remain lightweight (<100MB idle RAM). Avoid adding heavy runtime dependencies.
- **Contest Compliance**: Code completion runs strictly via local offline Language Server Protocol (`clangd`, `rust-analyzer`, `pyright`). Never inject external cloud AI dependencies into contest environments.
- **Clean File Storage**: User files saved to disk must remain clean without internal UI line-padding artifacts (`stripPaddingLines`).
