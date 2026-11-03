use std::path::{Path, PathBuf};

pub fn get_desktop_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            let p = PathBuf::from(profile).join("Desktop");
            if p.exists() {
                return Some(p);
            }
        }
    }
    None
}

pub fn get_start_menu_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        if let Ok(app_data) = std::env::var("APPDATA") {
            let p = PathBuf::from(app_data)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs");
            return Some(p);
        }
    }
    None
}

#[cfg(windows)]
#[allow(non_snake_case, dead_code)]
fn create_shortcut_com(target_exe: &Path, shortcut_path: &Path, description: &str) -> Result<(), String> {
    use std::ffi::c_void;
    use windows_sys::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};

    #[repr(C)]
    #[allow(clippy::upper_case_acronyms)]
    struct GUID {
        data1: u32,
        data2: u16,
        data3: u16,
        data4: [u8; 8],
    }

    const CLSID_SHELL_LINK: GUID = GUID {
        data1: 0x00021401,
        data2: 0x0000,
        data3: 0x0000,
        data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };
    const IID_ISHELL_LINK_W: GUID = GUID {
        data1: 0x000214F9,
        data2: 0x0000,
        data3: 0x0000,
        data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };
    const IID_IPERSIST_FILE: GUID = GUID {
        data1: 0x0000010B,
        data2: 0x0000,
        data3: 0x0000,
        data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };

    #[repr(C)]
    struct IShellLinkWVtbl {
        pub QueryInterface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
        pub AddRef: unsafe extern "system" fn(*mut c_void) -> u32,
        pub Release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub GetPath: *const c_void,
        pub GetIDList: *const c_void,
        pub SetIDList: *const c_void,
        pub GetDescription: *const c_void,
        pub SetDescription: unsafe extern "system" fn(*mut c_void, *const u16) -> i32,
        pub GetWorkingDirectory: *const c_void,
        pub SetWorkingDirectory: unsafe extern "system" fn(*mut c_void, *const u16) -> i32,
        pub GetArguments: *const c_void,
        pub SetArguments: *const c_void,
        pub GetHotkey: *const c_void,
        pub SetHotkey: *const c_void,
        pub GetShowCmd: *const c_void,
        pub SetShowCmd: *const c_void,
        pub GetIconLocation: *const c_void,
        pub SetIconLocation: *const c_void,
        pub SetRelativePath: *const c_void,
        pub Resolve: *const c_void,
        pub SetPath: unsafe extern "system" fn(*mut c_void, *const u16) -> i32,
    }

    #[repr(C)]
    struct IPersistFileVtbl {
        pub QueryInterface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
        pub AddRef: unsafe extern "system" fn(*mut c_void) -> u32,
        pub Release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub GetClassID: *const c_void,
        pub IsDirty: *const c_void,
        pub Load: *const c_void,
        pub Save: unsafe extern "system" fn(*mut c_void, *const u16, i32) -> i32,
    }

    #[repr(C)]
    struct IShellLinkW {
        pub lpVtbl: *const IShellLinkWVtbl,
    }

    #[repr(C)]
    struct IPersistFile {
        pub lpVtbl: *const IPersistFileVtbl,
    }

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    unsafe {
        let _ = CoInitializeEx(std::ptr::null_mut(), COINIT_APARTMENTTHREADED as _);
        let mut shell_link_ptr: *mut c_void = std::ptr::null_mut();
        let hr = CoCreateInstance(
            &CLSID_SHELL_LINK as *const _ as _,
            std::ptr::null_mut(),
            CLSCTX_INPROC_SERVER,
            &IID_ISHELL_LINK_W as *const _ as _,
            &mut shell_link_ptr,
        );
        if hr != 0 || shell_link_ptr.is_null() {
            return Err(format!("CoCreateInstance failed: HRESULT {:#x}", hr));
        }

        let link = shell_link_ptr as *mut IShellLinkW;
        let wide_target = to_wide(&target_exe.to_string_lossy());
        let _ = ((*(*link).lpVtbl).SetPath)(shell_link_ptr, wide_target.as_ptr());

        let wide_desc = to_wide(description);
        let _ = ((*(*link).lpVtbl).SetDescription)(shell_link_ptr, wide_desc.as_ptr());

        if let Some(parent) = target_exe.parent() {
            let wide_parent = to_wide(&parent.to_string_lossy());
            let _ = ((*(*link).lpVtbl).SetWorkingDirectory)(shell_link_ptr, wide_parent.as_ptr());
        }

        let mut persist_file_ptr: *mut c_void = std::ptr::null_mut();
        let hr = ((*(*link).lpVtbl).QueryInterface)(
            shell_link_ptr,
            &IID_IPERSIST_FILE,
            &mut persist_file_ptr,
        );
        if hr != 0 || persist_file_ptr.is_null() {
            let _ = ((*(*link).lpVtbl).Release)(shell_link_ptr);
            return Err("Failed to QueryInterface for IPersistFile".to_string());
        }

        let persist = persist_file_ptr as *mut IPersistFile;
        let wide_save = to_wide(&shortcut_path.to_string_lossy());
        let save_hr = ((*(*persist).lpVtbl).Save)(persist_file_ptr, wide_save.as_ptr(), 1);

        let _ = ((*(*persist).lpVtbl).Release)(persist_file_ptr);
        let _ = ((*(*link).lpVtbl).Release)(shell_link_ptr);
        CoUninitialize();

        if save_hr != 0 {
            return Err(format!("IPersistFile::Save failed: HRESULT {:#x}", save_hr));
        }
    }
    Ok(())
}

#[cfg(windows)]
fn create_shortcut_mslnk(target_exe: &Path, shortcut_path: &Path) -> Result<(), String> {
    let sl = mslnk::ShellLink::new(target_exe).map_err(|e| e.to_string())?;
    sl.create_lnk(shortcut_path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn create_shortcut(target_exe: &Path, shortcut_path: &Path, description: &str) -> Result<(), String> {
    if let Some(parent) = shortcut_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    #[cfg(windows)]
    {
        if create_shortcut_com(target_exe, shortcut_path, description).is_ok() {
            return Ok(());
        }
        create_shortcut_mslnk(target_exe, shortcut_path)
    }
    #[cfg(not(windows))]
    {
        let _ = (target_exe, shortcut_path, description);
        Ok(())
    }
}

pub fn create_desktop_shortcut(target_exe: &Path) -> Result<(), String> {
    if let Some(desktop) = get_desktop_dir() {
        let shortcut_path = desktop.join("HoshiCP.lnk");
        create_shortcut(target_exe, &shortcut_path, "HoshiCP Competitive Programming Editor")
    } else {
        Ok(())
    }
}

pub fn create_start_menu_shortcut(target_exe: &Path) -> Result<(), String> {
    if let Some(start_menu) = get_start_menu_dir() {
        let shortcut_path = start_menu.join("HoshiCP.lnk");
        create_shortcut(target_exe, &shortcut_path, "HoshiCP Competitive Programming Editor")
    } else {
        Ok(())
    }
}

pub fn remove_shortcuts() -> Result<(), String> {
    if let Some(desktop) = get_desktop_dir() {
        let p = desktop.join("HoshiCP.lnk");
        if p.exists() {
            let _ = std::fs::remove_file(p);
        }
    }
    if let Some(start_menu) = get_start_menu_dir() {
        let p = start_menu.join("HoshiCP.lnk");
        if p.exists() {
            let _ = std::fs::remove_file(p);
        }
    }
    Ok(())
}
