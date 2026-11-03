use crate::setup::{is_process_running, perform_install, terminate_process, InstallerOptions};

#[cfg(windows)]
pub fn run_gui(opts: InstallerOptions) -> Result<(), String> {
    unsafe {
        run_win32_gui(opts)
    }
}

#[cfg(not(windows))]
pub fn run_gui(opts: InstallerOptions) -> Result<(), String> {
    perform_install(&opts, |pct, msg| {
        println!("[{:.0}%] {}", pct * 100.0, msg);
    })
}

#[cfg(windows)]
unsafe fn run_win32_gui(initial_opts: InstallerOptions) -> Result<(), String> {
    use std::sync::{Arc, Mutex};
    use windows_sys::Win32::Graphics::Gdi::*;
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Controls::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    let icce = INITCOMMONCONTROLSEX {
        dwSize: std::mem::size_of::<INITCOMMONCONTROLSEX>() as u32,
        dwICC: ICC_PROGRESS_CLASS,
    };
    InitCommonControlsEx(&icce);

    let instance = GetModuleHandleW(std::ptr::null());
    let class_name = to_wide("HoshiCP_Installer_Window");

    let mut wc: WNDCLASSW = std::mem::zeroed();
    wc.lpfnWndProc = Some(wnd_proc);
    wc.hInstance = instance;
    wc.lpszClassName = class_name.as_ptr();
    wc.hCursor = LoadCursorW(0 as _, IDC_ARROW);
    wc.hbrBackground = (COLOR_BTNFACE + 1) as HBRUSH;

    RegisterClassW(&wc);

    let title = to_wide("HoshiCP Setup ~ Sensei, let's install HoshiCP!");
    let win_w = 540;
    let win_h = 420;

    let screen_w = GetSystemMetrics(SM_CXSCREEN);
    let screen_h = GetSystemMetrics(SM_CYSCREEN);
    let start_x = (screen_w - win_w) / 2;
    let start_y = (screen_h - win_h) / 2;

    let app_state = Arc::new(Mutex::new(GuiState {
        opts: initial_opts,
        installing: false,
        finished: false,
        h_edit: 0 as _,
        h_browse: 0 as _,
        h_chk_desktop: 0 as _,
        h_chk_startmenu: 0 as _,
        h_progress: 0 as _,
        h_status: 0 as _,
        h_btn_install: 0 as _,
        h_btn_cancel: 0 as _,
    }));

    let _ = STATE.set(app_state.clone());

    let hwnd = CreateWindowExW(
        0,
        class_name.as_ptr(),
        title.as_ptr(),
        WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_VISIBLE,
        start_x,
        start_y,
        win_w,
        win_h,
        0 as _,
        0 as _,
        instance,
        std::ptr::null(),
    );

    if hwnd.is_null() {
        return Err("Failed to create installer window".to_string());
    }

    ShowWindow(hwnd, SW_SHOW);
    UpdateWindow(hwnd);

    let mut msg: MSG = std::mem::zeroed();
    while GetMessageW(&mut msg, 0 as _, 0, 0) > 0 {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    Ok(())
}

#[cfg(windows)]
struct GuiState {
    opts: InstallerOptions,
    installing: bool,
    finished: bool,
    h_edit: usize,
    h_browse: usize,
    h_chk_desktop: usize,
    h_chk_startmenu: usize,
    h_progress: usize,
    h_status: usize,
    h_btn_install: usize,
    h_btn_cancel: usize,
}

#[cfg(windows)]
static STATE: std::sync::OnceLock<std::sync::Arc<std::sync::Mutex<GuiState>>> = std::sync::OnceLock::new();

#[cfg(windows)]
const ID_EDIT_PATH: i32 = 101;
#[cfg(windows)]
const ID_BTN_BROWSE: i32 = 102;
#[cfg(windows)]
const ID_CHK_DESKTOP: i32 = 103;
#[cfg(windows)]
const ID_CHK_STARTMENU: i32 = 104;
#[cfg(windows)]
const ID_PROGRESS: i32 = 105;
#[cfg(windows)]
const ID_STATUS: i32 = 106;
#[cfg(windows)]
const ID_BTN_INSTALL: i32 = 107;
#[cfg(windows)]
const ID_BTN_CANCEL: i32 = 108;

#[cfg(windows)]
const WM_APP_PROGRESS: u32 = windows_sys::Win32::UI::WindowsAndMessaging::WM_USER + 101;
#[cfg(windows)]
const WM_APP_DONE: u32 = windows_sys::Win32::UI::WindowsAndMessaging::WM_USER + 102;

#[cfg(windows)]
const SS_LEFT: u32 = 0;

#[cfg(windows)]
unsafe extern "system" fn wnd_proc(
    hwnd: windows_sys::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows_sys::Win32::Foundation::WPARAM,
    lparam: windows_sys::Win32::Foundation::LPARAM,
) -> windows_sys::Win32::Foundation::LRESULT {
    use windows_sys::Win32::Foundation::*;
    use windows_sys::Win32::Graphics::Gdi::*;
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Controls::*;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::EnableWindow;
    use windows_sys::Win32::UI::Shell::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    match msg {
        WM_CREATE => {
            let instance = GetModuleHandleW(std::ptr::null());
            let font = GetStockObject(DEFAULT_GUI_FONT);

            let h_lbl = CreateWindowExW(
                0,
                to_wide("STATIC").as_ptr(),
                to_wide("Destination Folder:").as_ptr(),
                WS_CHILD | WS_VISIBLE | SS_LEFT,
                25,
                115,
                380,
                18,
                hwnd,
                0 as _,
                instance,
                std::ptr::null(),
            );
            SendMessageW(h_lbl, WM_SETFONT, font as _, 1);

            let initial_path = if let Some(state) = STATE.get() {
                state.lock().unwrap().opts.install_dir.to_string_lossy().to_string()
            } else {
                String::new()
            };

            let h_edit = CreateWindowExW(
                WS_EX_CLIENTEDGE,
                to_wide("EDIT").as_ptr(),
                to_wide(&initial_path).as_ptr(),
                WS_CHILD | WS_VISIBLE | WS_TABSTOP | (ES_AUTOHSCROLL as u32),
                25,
                135,
                380,
                26,
                hwnd,
                ID_EDIT_PATH as _,
                instance,
                std::ptr::null(),
            );
            SendMessageW(h_edit, WM_SETFONT, font as _, 1);

            let h_browse = CreateWindowExW(
                0,
                to_wide("BUTTON").as_ptr(),
                to_wide("Browse...").as_ptr(),
                WS_CHILD | WS_VISIBLE | WS_TABSTOP | (BS_PUSHBUTTON as u32),
                415,
                134,
                90,
                28,
                hwnd,
                ID_BTN_BROWSE as _,
                instance,
                std::ptr::null(),
            );
            SendMessageW(h_browse, WM_SETFONT, font as _, 1);

            let h_chk_desktop = CreateWindowExW(
                0,
                to_wide("BUTTON").as_ptr(),
                to_wide("Create Desktop shortcut").as_ptr(),
                WS_CHILD | WS_VISIBLE | WS_TABSTOP | (BS_AUTOCHECKBOX as u32),
                25,
                172,
                300,
                22,
                hwnd,
                ID_CHK_DESKTOP as _,
                instance,
                std::ptr::null(),
            );
            SendMessageW(h_chk_desktop, WM_SETFONT, font as _, 1);
            SendMessageW(h_chk_desktop, BM_SETCHECK, BST_CHECKED as _, 0);

            let h_chk_startmenu = CreateWindowExW(
                0,
                to_wide("BUTTON").as_ptr(),
                to_wide("Create Start Menu shortcut").as_ptr(),
                WS_CHILD | WS_VISIBLE | WS_TABSTOP | (BS_AUTOCHECKBOX as u32),
                25,
                198,
                300,
                22,
                hwnd,
                ID_CHK_STARTMENU as _,
                instance,
                std::ptr::null(),
            );
            SendMessageW(h_chk_startmenu, WM_SETFONT, font as _, 1);
            SendMessageW(h_chk_startmenu, BM_SETCHECK, BST_CHECKED as _, 0);

            let h_progress = CreateWindowExW(
                0,
                to_wide("msctls_progress32").as_ptr(),
                std::ptr::null(),
                WS_CHILD | WS_VISIBLE,
                25,
                232,
                480,
                22,
                hwnd,
                ID_PROGRESS as _,
                instance,
                std::ptr::null(),
            );
            SendMessageW(h_progress, PBM_SETRANGE32, 0, 100);
            SendMessageW(h_progress, PBM_SETPOS, 0, 0);

            let h_status = CreateWindowExW(
                0,
                to_wide("STATIC").as_ptr(),
                to_wide("Ready to install. Click 'Install' to begin.").as_ptr(),
                WS_CHILD | WS_VISIBLE | SS_LEFT,
                25,
                262,
                480,
                30,
                hwnd,
                ID_STATUS as _,
                instance,
                std::ptr::null(),
            );
            SendMessageW(h_status, WM_SETFONT, font as _, 1);

            let h_btn_install = CreateWindowExW(
                0,
                to_wide("BUTTON").as_ptr(),
                to_wide("Install").as_ptr(),
                WS_CHILD | WS_VISIBLE | WS_TABSTOP | (BS_DEFPUSHBUTTON as u32),
                295,
                320,
                110,
                34,
                hwnd,
                ID_BTN_INSTALL as _,
                instance,
                std::ptr::null(),
            );
            SendMessageW(h_btn_install, WM_SETFONT, font as _, 1);

            let h_btn_cancel = CreateWindowExW(
                0,
                to_wide("BUTTON").as_ptr(),
                to_wide("Cancel").as_ptr(),
                WS_CHILD | WS_VISIBLE | WS_TABSTOP | (BS_PUSHBUTTON as u32),
                415,
                320,
                90,
                34,
                hwnd,
                ID_BTN_CANCEL as _,
                instance,
                std::ptr::null(),
            );
            SendMessageW(h_btn_cancel, WM_SETFONT, font as _, 1);

            if let Some(state) = STATE.get() {
                let mut s = state.lock().unwrap();
                s.h_edit = h_edit as usize;
                s.h_browse = h_browse as usize;
                s.h_chk_desktop = h_chk_desktop as usize;
                s.h_chk_startmenu = h_chk_startmenu as usize;
                s.h_progress = h_progress as usize;
                s.h_status = h_status as usize;
                s.h_btn_install = h_btn_install as usize;
                s.h_btn_cancel = h_btn_cancel as usize;
            }

            0
        }

        WM_PAINT => {
            let mut ps: PAINTSTRUCT = std::mem::zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);

            let rect = RECT {
                left: 0,
                top: 0,
                right: 540,
                bottom: 95,
            };
            let brush = CreateSolidBrush(0x00F0E8FF);
            FillRect(hdc, &rect, brush);
            DeleteObject(brush as _);

            let line_rect = RECT {
                left: 0,
                top: 94,
                right: 540,
                bottom: 95,
            };
            let line_brush = CreateSolidBrush(0x00E1C8DC);
            FillRect(hdc, &line_rect, line_brush);
            DeleteObject(line_brush as _);

            SetBkMode(hdc, TRANSPARENT as _);

            let font_title = CreateFontW(
                -20, 0, 0, 0, FW_BOLD as _, 0, 0, 0,
                DEFAULT_CHARSET as u32, OUT_DEFAULT_PRECIS as u32, CLIP_DEFAULT_PRECIS as u32,
                CLEARTYPE_QUALITY as u32, (DEFAULT_PITCH | FF_DONTCARE) as u32,
                to_wide("Segoe UI").as_ptr(),
            );
            let old_font = SelectObject(hdc, font_title as _);
            SetTextColor(hdc, 0x005A2D48);
            let title_text = to_wide("✦ HoshiCP Setup ✦");
            let mut title_rect = RECT { left: 25, top: 14, right: 520, bottom: 42 };
            DrawTextW(hdc, title_text.as_ptr(), -1, &mut title_rect, DT_LEFT | DT_SINGLELINE);

            let font_sub = CreateFontW(
                -13, 0, 0, 0, FW_NORMAL as _, 0, 0, 0,
                DEFAULT_CHARSET as u32, OUT_DEFAULT_PRECIS as u32, CLIP_DEFAULT_PRECIS as u32,
                CLEARTYPE_QUALITY as u32, (DEFAULT_PITCH | FF_DONTCARE) as u32,
                to_wide("Segoe UI").as_ptr(),
            );
            SelectObject(hdc, font_sub as _);
            SetTextColor(hdc, 0x00784860);
            let sub_text = to_wide("Uhee~ Welcome Sensei! Let's get your competitive programming IDE ready~");
            let mut sub_rect = RECT { left: 25, top: 44, right: 520, bottom: 65 };
            DrawTextW(hdc, sub_text.as_ptr(), -1, &mut sub_rect, DT_LEFT | DT_SINGLELINE);

            let badge_text = to_wide("🌸 Abydos Foreclosure Task Force • Takanashi Hoshino Edition 💙");
            let mut badge_rect = RECT { left: 25, top: 68, right: 520, bottom: 88 };
            DrawTextW(hdc, badge_text.as_ptr(), -1, &mut badge_rect, DT_LEFT | DT_SINGLELINE);

            SelectObject(hdc, old_font);
            DeleteObject(font_title as _);
            DeleteObject(font_sub as _);

            EndPaint(hwnd, &ps);
            0
        }

        WM_COMMAND => {
            let id = (wparam & 0xFFFF) as i32;
            let code = ((wparam >> 16) & 0xFFFF) as u32;

            if id == ID_BTN_CANCEL && code == BN_CLICKED {
                DestroyWindow(hwnd);
                return 0;
            }

            if id == ID_BTN_BROWSE && code == BN_CLICKED {
                let mut bi: BROWSEINFOW = std::mem::zeroed();
                bi.hwndOwner = hwnd;
                let title = to_wide("Select Destination Folder for HoshiCP:");
                bi.lpszTitle = title.as_ptr();
                bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE;

                let pidl = SHBrowseForFolderW(&bi);
                if !pidl.is_null() {
                    let mut path_buf = [0u16; 1024];
                    if SHGetPathFromIDListW(pidl, path_buf.as_mut_ptr()) != 0 {
                        let len = path_buf.iter().position(|&c| c == 0).unwrap_or(path_buf.len());
                        let selected = String::from_utf16_lossy(&path_buf[..len]);
                        let full_path = std::path::PathBuf::from(selected).join("HoshiCP");
                        let full_wide = to_wide(&full_path.to_string_lossy());
                        if let Some(state) = STATE.get() {
                            let s = state.lock().unwrap();
                            SetWindowTextW(s.h_edit as _, full_wide.as_ptr());
                        }
                    }
                }
                return 0;
            }

            if id == ID_BTN_INSTALL && code == BN_CLICKED {
                let state_arc = match STATE.get() {
                    Some(s) => s.clone(),
                    None => return 0,
                };

                let mut s = state_arc.lock().unwrap();

                if s.finished {
                    let exe_path = s.opts.install_dir.join("HoshiCP.exe");
                    let _ = std::process::Command::new(exe_path).spawn();
                    DestroyWindow(hwnd);
                    return 0;
                }

                if s.installing {
                    return 0;
                }

                if is_process_running("HoshiCP.exe") {
                    let question = to_wide("HoshiCP is currently running.\n\nTo prevent file-in-use locking, HoshiCP must be closed before installing.\n\nWould you like the installer to terminate HoshiCP now?");
                    let caption = to_wide("HoshiCP Process Running");
                    let res = MessageBoxW(hwnd, question.as_ptr(), caption.as_ptr(), MB_YESNOCANCEL | MB_ICONQUESTION);
                    if res == IDYES {
                        let _ = terminate_process("HoshiCP.exe");
                    } else {
                        SetWindowTextW(s.h_status as _, to_wide("Installation paused. Close HoshiCP and click Install.").as_ptr());
                        return 0;
                    }
                }

                let mut buf = [0u16; 1024];
                let text_len = GetWindowTextW(s.h_edit as _, buf.as_mut_ptr(), buf.len() as i32);
                let chosen_dir = if text_len > 0 {
                    String::from_utf16_lossy(&buf[..text_len as usize])
                } else {
                    s.opts.install_dir.to_string_lossy().to_string()
                };

                let chk_desktop = SendMessageW(s.h_chk_desktop as _, BM_GETCHECK, 0, 0) == BST_CHECKED as _;
                let chk_startmenu = SendMessageW(s.h_chk_startmenu as _, BM_GETCHECK, 0, 0) == BST_CHECKED as _;

                s.opts.install_dir = std::path::PathBuf::from(chosen_dir);
                s.opts.create_desktop_shortcut = chk_desktop;
                s.opts.create_start_menu_shortcut = chk_startmenu;
                s.installing = true;

                EnableWindow(s.h_btn_install as _, 0);
                EnableWindow(s.h_browse as _, 0);
                EnableWindow(s.h_edit as _, 0);
                EnableWindow(s.h_chk_desktop as _, 0);
                EnableWindow(s.h_chk_startmenu as _, 0);

                let opts_clone = s.opts.clone();
                let hwnd_clone = hwnd as usize;

                std::thread::spawn(move || {
                    let res = perform_install(&opts_clone, move |pct, msg| {
                        let pct_int = (pct * 100.0).clamp(0.0, 100.0) as usize;
                        let msg_box = Box::new(msg.to_string());
                        let raw_ptr = Box::into_raw(msg_box);
                        unsafe {
                            PostMessageW(
                                hwnd_clone as _,
                                WM_APP_PROGRESS,
                                pct_int,
                                raw_ptr as _,
                            );
                        }
                    });

                    let err_ptr = match res {
                        Ok(()) => std::ptr::null_mut(),
                        Err(e) => Box::into_raw(Box::new(e)),
                    };

                    unsafe {
                        PostMessageW(
                            hwnd_clone as _,
                            WM_APP_DONE,
                            if err_ptr.is_null() { 0 } else { 1 },
                            err_ptr as _,
                        );
                    }
                });

                return 0;
            }

            0
        }

        WM_APP_PROGRESS => {
            let pct = wparam as i32;
            let msg_ptr = lparam as *mut String;
            let msg_text = if !msg_ptr.is_null() {
                let s = *Box::from_raw(msg_ptr);
                s
            } else {
                String::new()
            };

            if let Some(state) = STATE.get() {
                let s = state.lock().unwrap();
                SendMessageW(s.h_progress as _, PBM_SETPOS, pct as _, 0);
                SetWindowTextW(s.h_status as _, to_wide(&msg_text).as_ptr());
            }
            0
        }

        WM_APP_DONE => {
            let is_err = wparam != 0;
            let err_ptr = lparam as *mut String;
            let err_str = if !err_ptr.is_null() {
                Some(*Box::from_raw(err_ptr))
            } else {
                None
            };

            if let Some(state) = STATE.get() {
                let mut s = state.lock().unwrap();
                s.installing = false;

                if is_err {
                    let err_msg = err_str.unwrap_or_else(|| "Unknown installation error".to_string());
                    SetWindowTextW(s.h_status as _, to_wide(&format!("Error: {}", err_msg)).as_ptr());
                    EnableWindow(s.h_btn_install as _, 1);
                    EnableWindow(s.h_browse as _, 1);
                    EnableWindow(s.h_edit as _, 1);
                    MessageBoxW(
                        hwnd,
                        to_wide(&format!("Installation could not complete:\n\n{}", err_msg)).as_ptr(),
                        to_wide("Installation Failed").as_ptr(),
                        MB_ICONERROR | MB_OK,
                    );
                } else {
                    s.finished = true;
                    SendMessageW(s.h_progress as _, PBM_SETPOS, 100, 0);
                    SetWindowTextW(
                        s.h_status as _,
                        to_wide("✨ Installation complete! Sensei, HoshiCP is ready to launch! ✨").as_ptr(),
                    );
                    SetWindowTextW(s.h_btn_install as _, to_wide("Launch HoshiCP").as_ptr());
                    SetWindowTextW(s.h_btn_cancel as _, to_wide("Close").as_ptr());
                    EnableWindow(s.h_btn_install as _, 1);
                    EnableWindow(s.h_btn_cancel as _, 1);
                }
            }
            0
        }

        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }

        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}
