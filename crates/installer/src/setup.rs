use std::borrow::Cow;
use std::io::Cursor;
use std::path::{Component, Path, PathBuf};
use zip::ZipArchive;

pub static DEFAULT_PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/payload.zip"));

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InstallerOptions {
    pub install_dir: PathBuf,
    pub create_desktop_shortcut: bool,
    pub create_start_menu_shortcut: bool,
    pub silent: bool,
}

impl Default for InstallerOptions {
    fn default() -> Self {
        Self {
            install_dir: default_install_dir(),
            create_desktop_shortcut: true,
            create_start_menu_shortcut: true,
            silent: false,
        }
    }
}

impl AsRef<Path> for InstallerOptions {
    fn as_ref(&self) -> &Path {
        &self.install_dir
    }
}

pub fn default_install_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(local_app_data).join("Programs").join("HoshiCP");
        }
    }
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("HoshiCP")
}

pub fn parse_args() -> InstallerOptions {
    parse_args_from(std::env::args())
}

pub fn parse_args_from<I: Iterator<Item = String>>(args: I) -> InstallerOptions {
    let mut opts = InstallerOptions::default();
    let mut iter = args.skip(1);
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--silent" | "-s" => opts.silent = true,
            "--no-shortcuts" => {
                opts.create_desktop_shortcut = false;
                opts.create_start_menu_shortcut = false;
            }
            "--no-desktop-shortcut" => opts.create_desktop_shortcut = false,
            "--no-start-menu-shortcut" => opts.create_start_menu_shortcut = false,
            "--install-dir" | "-d" => {
                if let Some(dir) = iter.next() {
                    opts.install_dir = PathBuf::from(dir);
                }
            }
            _ => {}
        }
    }
    opts
}

#[cfg(windows)]
pub fn is_process_running(process_name: &str) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Diagnostics::ToolHelp::*;

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == (-1isize) as _ {
        return false;
    }

    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut found = false;

    if unsafe { Process32FirstW(snapshot, &mut entry) } != 0 {
        let current_pid = std::process::id();
        loop {
            if entry.th32ProcessID != current_pid {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..len]);
                if name.eq_ignore_ascii_case(process_name) {
                    found = true;
                    break;
                }
            }
            if unsafe { Process32NextW(snapshot, &mut entry) } == 0 {
                break;
            }
        }
    }

    unsafe { CloseHandle(snapshot) };
    found
}

#[cfg(not(windows))]
pub fn is_process_running(_process_name: &str) -> bool {
    false
}

#[cfg(windows)]
pub fn terminate_process(process_name: &str) -> Result<usize, String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Diagnostics::ToolHelp::*;
    use windows_sys::Win32::System::Threading::*;

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == (-1isize) as _ {
        return Err("Failed to create snapshot for process termination".to_string());
    }

    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut count = 0;

    if unsafe { Process32FirstW(snapshot, &mut entry) } != 0 {
        let current_pid = std::process::id();
        loop {
            if entry.th32ProcessID != current_pid {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..len]);
                if name.eq_ignore_ascii_case(process_name) {
                    let h_proc = unsafe { OpenProcess(PROCESS_TERMINATE, 0, entry.th32ProcessID) };
                    if !h_proc.is_null() {
                        let terminated = unsafe { TerminateProcess(h_proc, 1) };
                        unsafe { CloseHandle(h_proc) };
                        if terminated != 0 {
                            count += 1;
                        }
                    }
                }
            }
            if unsafe { Process32NextW(snapshot, &mut entry) } == 0 {
                break;
            }
        }
    }

    unsafe { CloseHandle(snapshot) };
    if count > 0 {
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    Ok(count)
}

#[cfg(not(windows))]
pub fn terminate_process(_process_name: &str) -> Result<usize, String> {
    Ok(0)
}

pub fn extract_payload<P: AsRef<Path>>(target_dir: P) -> std::io::Result<usize> {
    extract_payload_with_progress(target_dir, |_, _, _| {})
}

pub fn extract_payload_with_progress<P: AsRef<Path>, F: FnMut(usize, usize, &str)>(
    target_dir: P,
    mut on_progress: F,
) -> std::io::Result<usize> {
    let target = target_dir.as_ref();
    std::fs::create_dir_all(target)?;

    let adjacent_payload = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|parent| parent.join("payload.zip")));

    let payload_bytes: Cow<'static, [u8]> = if let Some(adj) = adjacent_payload.filter(|p| p.exists()) {
        Cow::Owned(std::fs::read(adj)?)
    } else {
        Cow::Borrowed(DEFAULT_PAYLOAD)
    };

    let cursor = Cursor::new(payload_bytes);
    let mut archive = ZipArchive::new(cursor)?;
    let total_len = archive.len();

    let mut extracted_count = 0;
    for i in 0..total_len {
        let mut file = archive.by_index(i)?;
        let raw_path = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };

        if raw_path.components().any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_))) {
            continue;
        }

        let out_path = target.join(&raw_path);
        let file_name = raw_path.to_string_lossy().to_string();

        if file.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&out_path)?;
            std::io::copy(&mut file, &mut outfile)?;
            extracted_count += 1;
        }

        on_progress(i + 1, total_len, &file_name);
    }

    if let Ok(current_exe) = std::env::current_exe() {
        let uninstaller_path = target.join("uninstall.exe");
        let _ = std::fs::copy(current_exe, uninstaller_path);
    }

    Ok(extracted_count)
}

pub fn register_uninstaller(install_dir: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_ALL_ACCESS};
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\HoshiCP";
        let (key, _) = hkcu.create_subkey_with_flags(path, KEY_ALL_ACCESS)?;

        key.set_value("DisplayName", &"HoshiCP")?;
        key.set_value("DisplayVersion", &"0.1.0")?;
        key.set_value("Publisher", &"nmkdeveloper")?;
        key.set_value("InstallLocation", &install_dir.to_string_lossy().as_ref())?;

        let uninstall_cmd = format!(
            "\"{}\" --uninstall --install-dir \"{}\"",
            install_dir.join("uninstall.exe").display(),
            install_dir.display()
        );
        key.set_value("UninstallString", &uninstall_cmd)?;

        let icon_cmd = format!("\"{}\",0", install_dir.join("HoshiCP.exe").display());
        key.set_value("DisplayIcon", &icon_cmd)?;

        key.set_value("EstimatedSize", &50000u32)?;
        key.set_value("NoModify", &1u32)?;
        key.set_value("NoRepair", &1u32)?;
    }
    #[cfg(not(windows))]
    {
        let _ = install_dir;
    }
    Ok(())
}

pub fn unregister_uninstaller() -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_ALL_ACCESS};
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
        if let Ok(key) = hkcu.open_subkey_with_flags(path, KEY_ALL_ACCESS) {
            let _ = key.delete_subkey_all("HoshiCP");
        }
    }
    Ok(())
}

pub fn perform_install<F: FnMut(f32, &str)>(
    opts: &InstallerOptions,
    mut progress: F,
) -> Result<(), String> {
    progress(0.1, "Checking for running instances of HoshiCP...");
    if is_process_running("HoshiCP.exe") {
        progress(0.15, "Terminating running HoshiCP process...");
        let _ = terminate_process("HoshiCP.exe");
    }

    progress(0.3, "Extracting HoshiCP application files...");
    extract_payload_with_progress(&opts.install_dir, |curr, total, name| {
        let pct = 0.3 + 0.4 * (curr as f32 / total.max(1) as f32);
        progress(pct, &format!("Extracting {}...", name));
    })
    .map_err(|e| format!("Extraction failed: {}", e))?;

    let exe_path = opts.install_dir.join("HoshiCP.exe");

    progress(0.75, "Configuring shortcuts...");
    if opts.create_desktop_shortcut {
        let _ = crate::shortcuts::create_desktop_shortcut(&exe_path);
    }
    if opts.create_start_menu_shortcut {
        let _ = crate::shortcuts::create_start_menu_shortcut(&exe_path);
    }

    progress(0.9, "Registering uninstaller with Windows...");
    let _ = register_uninstaller(&opts.install_dir);

    progress(1.0, "Installation complete! Sensei, HoshiCP is ready!");
    Ok(())
}

pub fn perform_uninstall(install_dir: &Path) -> Result<(), String> {
    if is_process_running("HoshiCP.exe") {
        let _ = terminate_process("HoshiCP.exe");
    }
    let _ = crate::shortcuts::remove_shortcuts();
    let _ = unregister_uninstaller();
    if install_dir.exists() {
        let is_running_from_target = std::env::current_exe()
            .ok()
            .map(|p| p.starts_with(install_dir))
            .unwrap_or(false);

        if is_running_from_target {
            if let Ok(entries) = std::fs::read_dir(install_dir) {
                let current_exe = std::env::current_exe().ok();
                for entry in entries.flatten() {
                    let path = entry.path();
                    if Some(&path) == current_exe.as_ref() {
                        continue;
                    }
                    if path.is_dir() {
                        let _ = std::fs::remove_dir_all(&path);
                    } else {
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }

            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const DETACHED_PROCESS: u32 = 0x00000008;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                let cmd = format!("ping 127.0.0.1 -n 2 > nul & rd /s /q \"{}\"", install_dir.display());
                let _ = std::process::Command::new("cmd.exe")
                    .raw_arg(format!("/C \"{}\"", cmd))
                    .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
                    .spawn();
            }
            #[cfg(not(windows))]
            {
                let _ = std::fs::remove_dir_all(install_dir);
            }
        } else if std::fs::remove_dir_all(install_dir).is_err() {
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const DETACHED_PROCESS: u32 = 0x00000008;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                let cmd = format!("ping 127.0.0.1 -n 2 > nul & rd /s /q \"{}\"", install_dir.display());
                let _ = std::process::Command::new("cmd.exe")
                    .raw_arg(format!("/C \"{}\"", cmd))
                    .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
                    .spawn();
            }
        }
    }
    Ok(())
}
