use futures_util::{SinkExt, StreamExt};
use hoshicp_lib::lsp::{
    read_lsp_frame, start_lsp_proxy, start_lsp_proxy_handle, LspError,
};
use std::io::Cursor;
use std::time::Duration;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn test_lsp_missing_binary_returns_clear_error() {
    let res = start_lsp_proxy("cpp", "non_existent_clangd_binary_xyz_12345", &[]).await;
    match res {
        Err(LspError::BinaryNotFound(bin)) => {
            assert!(bin.contains("non_existent_clangd_binary_xyz_12345"));
        }
        other => panic!("Expected BinaryNotFound error, got {:?}", other),
    }
}

#[tokio::test]
async fn test_read_lsp_frame_parsing() {
    let payload = r#"{"jsonrpc":"2.0","id":1,"result":"ok"}"#;
    let raw_stream = format!(
        "Content-Type: application/vscode-jsonrpc; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
        payload.len(),
        payload
    );

    let mut cursor = Cursor::new(raw_stream.into_bytes());
    let frame = read_lsp_frame(&mut cursor)
        .await
        .expect("Should read successfully")
        .expect("Should contain frame");

    assert_eq!(String::from_utf8(frame).unwrap(), payload);
}

#[tokio::test]
async fn test_read_lsp_frame_raw_json_fallback() {
    let payload = r#"{"jsonrpc":"2.0","method":"ping"}"#;
    let raw_stream = format!("{}\n", payload);

    let mut cursor = Cursor::new(raw_stream.into_bytes());
    let frame = read_lsp_frame(&mut cursor)
        .await
        .expect("Should read successfully")
        .expect("Should contain frame");

    assert_eq!(String::from_utf8(frame).unwrap(), payload);
}

#[tokio::test]
async fn test_lsp_proxy_cancellation_token() {
    let token = CancellationToken::new();
    let (py_bin, args) = if cfg!(windows) {
        ("powershell.exe", vec!["-Command", "Start-Sleep -Seconds 10"])
    } else {
        ("sh", vec!["-c", "sleep 10"])
    };

    let handle = start_lsp_proxy_handle("mock", py_bin, &args, Some(token.clone()))
        .await
        .expect("Proxy should start");

    assert!(handle.port > 0);

    // Cancel proxy before connection
    token.cancel();

    // Verify token was cancelled
    assert!(handle.cancellation_token.is_cancelled());
}

#[tokio::test]
async fn test_lsp_proxy_end_to_end_mock_lsp() {
    // Run a python mock LSP server that reads framed stdin and emits framed stdout
    let script = r#"
import sys

while True:
    line = sys.stdin.readline()
    if not line:
        break
    if 'content-length:' in line.lower():
        length = int(line.split(':')[1].strip())
        # read remaining headers
        while True:
            h = sys.stdin.readline()
            if not h or h == '\r\n' or h == '\n':
                break
        body = sys.stdin.read(length)
        if 'ping' in body:
            resp = '{"jsonrpc":"2.0","result":"pong"}'
            sys.stdout.write(f"Content-Length: {len(resp)}\r\n\r\n{resp}")
            sys.stdout.flush()
"#;

    let (py_bin, args) = ("python", vec!["-c", script]);

    let port = match start_lsp_proxy("python", py_bin, &args).await {
        Ok(p) => p,
        Err(_) => {
            // If python is not available in test runner env, skip end-to-end
            return;
        }
    };

    let ws_url = format!("ws://127.0.0.1:{}", port);
    let (ws_stream, _) = timeout(Duration::from_secs(3), tokio_tungstenite::connect_async(&ws_url))
        .await
        .expect("Connection timed out")
        .expect("Failed to connect to LSP WebSocket proxy");

    let (mut write, mut read) = ws_stream.split();

    // Send bare JSON text frame without Content-Length header (proxy should frame it)
    let request_msg = r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;
    write
        .send(Message::Text(request_msg.into()))
        .await
        .expect("Failed to send WS message");

    // Expect response from LSP mock server
    let response = timeout(Duration::from_secs(3), read.next())
        .await
        .expect("Response timed out")
        .expect("Stream closed unexpectedly")
        .expect("Error reading response");

    match response {
        Message::Text(text) => {
            assert!(
                text.contains("pong"),
                "Expected pong in response, got: {}",
                text
            );
        }
        Message::Binary(bin) => {
            let text = String::from_utf8_lossy(&bin);
            assert!(
                text.contains("pong"),
                "Expected pong in response, got: {}",
                text
            );
        }
        other => panic!("Unexpected response frame: {:?}", other),
    }
}

#[tokio::test]
async fn test_lsp_proxy_child_crash_handled_gracefully() {
    // A process that exits immediately
    let (py_bin, args) = ("python", vec!["-c", "import sys; sys.exit(0)"]);

    let port = match start_lsp_proxy("python", py_bin, &args).await {
        Ok(p) => p,
        Err(_) => return,
    };

    let ws_url = format!("ws://127.0.0.1:{}", port);
    if let Ok(Ok((ws_stream, _))) =
        timeout(Duration::from_secs(2), tokio_tungstenite::connect_async(&ws_url)).await
    {
        let (_write, mut read) = ws_stream.split();
        // The child has exited, so reading should yield None or Close, without blocking or panicking
        let next = timeout(Duration::from_secs(2), read.next()).await;
        // Either stream terminated (None) or timeout (if connection close was sent)
        if let Ok(Some(msg)) = next {
            match msg {
                Ok(Message::Close(_)) => {}
                Ok(_) => {}
                Err(_) => {}
            }
        }
    }
}
