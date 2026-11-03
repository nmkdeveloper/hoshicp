use std::fs::File;
use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

fn main() {
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("payload.zip");

    let local_payload = Path::new("payload.zip");
    if local_payload.exists() {
        std::fs::copy(local_payload, &dest_path).unwrap();
        println!("cargo:rerun-if-changed=payload.zip");
        return;
    }

    let file = File::create(&dest_path).expect("failed to create zip file");
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // 1. HoshiCP.exe
    zip.start_file("HoshiCP.exe", options).unwrap();
    let candidate_paths = [
        "../../src-tauri/target/release/hoshicp.exe",
        "../../target/release/hoshicp.exe",
        "../../src-tauri/target/debug/hoshicp.exe",
    ];
    let mut exe_bytes = None;
    for cp in candidate_paths {
        if let Ok(bytes) = std::fs::read(cp) {
            exe_bytes = Some(bytes);
            break;
        }
    }
    if let Some(bytes) = exe_bytes {
        zip.write_all(&bytes).unwrap();
    } else {
        let mut dummy = vec![0u8; 1024];
        dummy[0] = b'M';
        dummy[1] = b'Z';
        zip.write_all(&dummy).unwrap();
    }

    // 2. README.txt
    zip.start_file("README.txt", options).unwrap();
    zip.write_all(b"HoshiCP ~ Cute & Lightning-fast Competitive Programming IDE\nDeveloped with Rust and Blue Archive Hoshino love!\n").unwrap();

    // 3. icon.png
    let icon_path = Path::new("../../public/icon.png");
    if icon_path.exists() {
        if let Ok(bytes) = std::fs::read(icon_path) {
            zip.start_file("icon.png", options).unwrap();
            zip.write_all(&bytes).unwrap();
        }
    }

    zip.finish().expect("failed to finalize zip");
    println!("cargo:rerun-if-changed=../../public/icon.png");
    println!("cargo:rerun-if-changed=build.rs");
}
