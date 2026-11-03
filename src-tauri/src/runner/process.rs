use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RunStatus {
    Accepted,
    WrongAnswer,
    TimeLimitExceeded,
    MemoryLimitExceeded,
    RuntimeError,
    CompilationError,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub execution_time_ms: u64,
    pub memory_usage_kb: u64,
    pub status: RunStatus,
}

const MAX_OUTPUT_BYTES: usize = 16 * 1024 * 1024; // 16 MB

#[cfg(windows)]
struct JobGuard {
    handle: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(windows)]
unsafe impl Send for JobGuard {}
#[cfg(windows)]
unsafe impl Sync for JobGuard {}

#[cfg(windows)]
impl JobGuard {
    fn new(memory_limit_mb: u64) -> Option<Self> {
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return None;
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            if memory_limit_mb > 0 {
                info.BasicLimitInformation.LimitFlags |=
                    JOB_OBJECT_LIMIT_PROCESS_MEMORY | JOB_OBJECT_LIMIT_JOB_MEMORY;
                let limit_bytes = (memory_limit_mb as usize) * 1024 * 1024;
                info.ProcessMemoryLimit = limit_bytes;
                info.JobMemoryLimit = limit_bytes;
            }

            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );

            Some(JobGuard { handle })
        }
    }

    fn assign(&self, pid: u32) -> bool {
        use windows_sys::Win32::Foundation::*;
        use windows_sys::Win32::System::JobObjects::*;
        use windows_sys::Win32::System::Threading::*;
        unsafe {
            let proc_handle = OpenProcess(
                PROCESS_SET_QUOTA | PROCESS_TERMINATE | PROCESS_QUERY_INFORMATION,
                0,
                pid,
            );
            if proc_handle.is_null() {
                return false;
            }
            let ok = AssignProcessToJobObject(self.handle, proc_handle);
            CloseHandle(proc_handle);
            ok != 0
        }
    }

    fn terminate(&self) {
        use windows_sys::Win32::System::JobObjects::TerminateJobObject;
        unsafe {
            TerminateJobObject(self.handle, 1);
        }
    }

    fn get_peak_memory_kb(&self) -> u64 {
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            let res = QueryInformationJobObject(
                self.handle,
                JobObjectExtendedLimitInformation,
                &mut info as *mut _ as *mut core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                std::ptr::null_mut(),
            );
            if res != 0 {
                let peak = info.PeakJobMemoryUsed.max(info.PeakProcessMemoryUsed);
                (peak / 1024) as u64
            } else {
                0
            }
        }
    }
}

#[cfg(windows)]
impl Drop for JobGuard {
    fn drop(&mut self) {
        use windows_sys::Win32::Foundation::CloseHandle;
        unsafe {
            if !self.handle.is_null() {
                CloseHandle(self.handle);
            }
        }
    }
}

/// Executes a compiled binary or script asynchronously with stdin, time limit, and memory limit guards.
pub async fn execute_testcase_async(
    executable: &Path,
    input: &str,
    time_limit_ms: u64,
    memory_limit_mb: u64,
) -> ExecutionResult {
    let start_time = Instant::now();

    // Determine executable command and arguments
    let mut cmd = build_command(executable);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(unix)]
    {
        // On Unix, configure a separate process group so we can SIGKILL the whole tree on timeout
        cmd.process_group(0);
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(err) => {
            return ExecutionResult {
                stdout: String::new(),
                stderr: format!("Failed to spawn process: {}", err),
                exit_code: None,
                execution_time_ms: 0,
                memory_usage_kb: 0,
                status: RunStatus::RuntimeError,
            };
        }
    };

    let child_pid = child.id();

    #[cfg(windows)]
    let job_guard = {
        let guard = JobGuard::new(memory_limit_mb);
        if let (Some(ref g), Some(pid)) = (&guard, child_pid) {
            g.assign(pid);
        }
        guard
    };

    let mut stdin_pipe = child.stdin.take();
    let mut stdout_pipe = child.stdout.take();
    let mut stderr_pipe = child.stderr.take();

    let input_bytes = input.as_bytes().to_vec();

    // Async stdin writer
    let write_task = async move {
        if let Some(mut stdin) = stdin_pipe.take() {
            let _ = stdin.write_all(&input_bytes).await;
            let _ = stdin.flush().await;
            drop(stdin);
        }
    };

    // Async stdout reader
    let stdout_task = async move {
        let mut buf = Vec::new();
        if let Some(mut stdout) = stdout_pipe.take() {
            let mut chunk = [0u8; 8192];
            while let Ok(n) = stdout.read(&mut chunk).await {
                if n == 0 {
                    break;
                }
                if buf.len() + n <= MAX_OUTPUT_BYTES {
                    buf.extend_from_slice(&chunk[..n]);
                } else {
                    let rem = MAX_OUTPUT_BYTES.saturating_sub(buf.len());
                    buf.extend_from_slice(&chunk[..rem]);
                    buf.extend_from_slice(b"\n[Output truncated]");
                    break;
                }
            }
        }
        buf
    };

    // Async stderr reader
    let stderr_task = async move {
        let mut buf = Vec::new();
        if let Some(mut stderr) = stderr_pipe.take() {
            let mut chunk = [0u8; 8192];
            while let Ok(n) = stderr.read(&mut chunk).await {
                if n == 0 {
                    break;
                }
                if buf.len() + n <= MAX_OUTPUT_BYTES {
                    buf.extend_from_slice(&chunk[..n]);
                } else {
                    let rem = MAX_OUTPUT_BYTES.saturating_sub(buf.len());
                    buf.extend_from_slice(&chunk[..rem]);
                    buf.extend_from_slice(b"\n[Output truncated]");
                    break;
                }
            }
        }
        buf
    };

    let timeout_duration = Duration::from_millis(time_limit_ms);

    let wait_task = async {
        let (_, stdout_bytes, stderr_bytes) = tokio::join!(write_task, stdout_task, stderr_task);
        let status = child.wait().await;
        (status, stdout_bytes, stderr_bytes)
    };

    match tokio::time::timeout(timeout_duration, wait_task).await {
        Ok((status_res, stdout_bytes, stderr_bytes)) => {
            let elapsed_ms = start_time.elapsed().as_millis() as u64;

            #[cfg(windows)]
            let peak_memory_kb = job_guard
                .as_ref()
                .map(|g| g.get_peak_memory_kb())
                .unwrap_or(0);

            #[cfg(unix)]
            let peak_memory_kb = get_unix_rusage_kb();

            let stdout = String::from_utf8_lossy(&stdout_bytes).to_string();
            let stderr = String::from_utf8_lossy(&stderr_bytes).to_string();

            let exit_status = status_res.ok();
            let exit_code = exit_status.and_then(|s| s.code());

            let mut run_status = match exit_code {
                Some(0) => RunStatus::Accepted,
                _ => RunStatus::RuntimeError,
            };

            // Check if memory limit was exceeded
            if memory_limit_mb > 0 && peak_memory_kb > memory_limit_mb * 1024 {
                run_status = RunStatus::MemoryLimitExceeded;
            }

            // On Windows, STATUS_COMMITMENT_LIMIT is 0xC000012D (-1073741523)
            #[cfg(windows)]
            if exit_code == Some(-1073741523) || exit_code == Some(0xC000012D_u32 as i32) {
                run_status = RunStatus::MemoryLimitExceeded;
            }

            ExecutionResult {
                stdout,
                stderr,
                exit_code,
                execution_time_ms: elapsed_ms,
                memory_usage_kb: peak_memory_kb,
                status: run_status,
            }
        }
        Err(_) => {
            // Timeout fired - forcefully kill process tree
            #[cfg(windows)]
            if let Some(ref g) = job_guard {
                g.terminate();
            }

            #[cfg(unix)]
            if let Some(pid) = child_pid {
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGKILL);
                }
            }

            let _ = child.kill().await;

            let elapsed_ms = start_time.elapsed().as_millis() as u64;

            ExecutionResult {
                stdout: String::new(),
                stderr: "Time Limit Exceeded".to_string(),
                exit_code: None,
                execution_time_ms: elapsed_ms.max(time_limit_ms),
                memory_usage_kb: 0,
                status: RunStatus::TimeLimitExceeded,
            }
        }
    }
}

/// Synchronous wrapper around `execute_testcase_async`.
/// Safely runs in existing Tokio runtime or creates an isolated current_thread runtime.
pub fn execute_testcase(
    executable: &Path,
    input: &str,
    time_limit_ms: u64,
    memory_limit_mb: u64,
) -> ExecutionResult {
    if tokio::runtime::Handle::try_current().is_ok() {
        let exe = executable.to_path_buf();
        let inp = input.to_string();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Failed to build worker tokio runtime");
            rt.block_on(execute_testcase_async(&exe, &inp, time_limit_ms, memory_limit_mb))
        })
        .join()
        .expect("Execution thread panicked")
    } else {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to build tokio runtime");
        rt.block_on(execute_testcase_async(executable, input, time_limit_ms, memory_limit_mb))
    }
}

fn build_command(executable: &Path) -> Command {
    let ext = executable
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match ext.as_str() {
        "py" => {
            let mut cmd = Command::new(if cfg!(windows) { "python" } else { "python3" });
            cmd.arg(executable);
            cmd
        }
        "class" => {
            let mut cmd = Command::new("java");
            let parent = executable.parent().unwrap_or_else(|| Path::new("."));
            let stem = executable
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Solution");
            cmd.arg("-cp").arg(parent).arg(stem);
            cmd
        }
        "cmd" | "bat" if cfg!(windows) => {
            let mut cmd = Command::new("cmd.exe");
            cmd.arg("/C").arg(executable);
            cmd
        }
        _ => Command::new(executable),
    }
}

#[cfg(unix)]
fn get_unix_rusage_kb() -> u64 {
    let mut usage: libc::rusage = unsafe { std::mem::zeroed() };
    let res = unsafe { libc::getrusage(libc::RUSAGE_CHILDREN, &mut usage) };
    if res == 0 {
        if cfg!(target_os = "macos") {
            (usage.ru_maxrss / 1024) as u64
        } else {
            usage.ru_maxrss as u64
        }
    } else {
        0
    }
}
