#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use hoshicp_installer::setup::{parse_args, perform_install, perform_uninstall};
use hoshicp_installer::ui::run_gui;

fn main() {
    let opts = parse_args();

    if std::env::args().any(|a| a == "--uninstall") {
        let install_dir = if std::env::args().any(|a| a == "--install-dir" || a == "-d") {
            opts.install_dir
        } else if let Ok(exe_path) = std::env::current_exe() {
            if let Some(parent) = exe_path.parent() {
                if parent.join("HoshiCP.exe").exists() {
                    parent.to_path_buf()
                } else {
                    opts.install_dir
                }
            } else {
                opts.install_dir
            }
        } else {
            opts.install_dir
        };

        if let Err(e) = perform_uninstall(&install_dir) {
            eprintln!("Uninstall failed: {}", e);
            std::process::exit(1);
        }
        println!("HoshiCP successfully uninstalled.");
        return;
    }

    if opts.silent {
        println!("Starting silent installation of HoshiCP into: {}", opts.install_dir.display());
        let res = perform_install(&opts, |pct, msg| {
            println!("[{:.0}%] {}", pct * 100.0, msg);
        });
        match res {
            Ok(()) => {
                println!("HoshiCP silent installation completed successfully!");
            }
            Err(e) => {
                eprintln!("Installation error: {}", e);
                std::process::exit(1);
            }
        }
    } else {
        if let Err(e) = run_gui(opts) {
            eprintln!("GUI error: {}", e);
            std::process::exit(1);
        }
    }
}
