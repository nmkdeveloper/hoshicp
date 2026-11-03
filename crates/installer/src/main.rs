#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use hoshicp_installer::setup::{parse_args, perform_install, perform_uninstall};
use hoshicp_installer::ui::run_gui;

fn main() {
    let opts = parse_args();

    if std::env::args().any(|a| a == "--uninstall") {
        if let Err(e) = perform_uninstall(&opts.install_dir) {
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
