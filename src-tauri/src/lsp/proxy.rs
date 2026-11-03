use futures_util::{SinkExt, StreamExt};
use std::fmt;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::process::Command;
use tokio_tungstenite::tungstenite::Message;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub enum LspError {
    BinaryNotFound(String),
    ProcessSpawnFailed(String),
    Io(String),
    ServerBindFailed(String),
    Closed,
    Generic(String),
}

impl fmt::Display for LspError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LspError::BinaryNotFound(bin) => write!(f, "LSP binary not found: {}", bin),
            LspError::ProcessSpawnFailed(msg) => write!(f, "Failed to spawn LSP process: {}", msg),
            LspError::Io(err) => write!(f, "LSP I/O error: {}", err),
            LspError::ServerBindFailed(err) => {
                write!(f, "Failed to bind LSP WebSocket server: {}", err)
            }
            LspError::Closed => write!(f, "LSP proxy server closed"),
            LspError::Generic(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for LspError {}

impl From<std::io::Error> for LspError {
    fn from(err: std::io::Error) -> Self {
        if err.kind() == std::io::ErrorKind::NotFound {
            LspError::BinaryNotFound(err.to_string())
        } else {
            LspError::Io(err.to_string())
        }
    }
}

pub struct LspProxyHandle {
    pub port: u16,
    pub cancellation_token: CancellationToken,
}

/// Reads a single LSP frame from the stream.
/// LSP frames begin with headers ending with "\r\n\r\n", including "Content-Length: <len>".
/// Followed by `<len>` bytes of JSON-RPC payload.
/// Also supports raw JSON lines (starting with '{') for mock/simplified LSP servers.
pub async fn read_lsp_frame<R: tokio::io::AsyncBufRead + Unpin>(
    reader: &mut R,
) -> Result<Option<Vec<u8>>, std::io::Error> {
    let mut content_length: Option<usize> = None;
    let mut line = String::new();

    loop {
        line.clear();
        let bytes_read = reader.read_line(&mut line).await?;
        if bytes_read == 0 {
            // EOF reached
            return Ok(None);
        }

        let trimmed = line.trim_end_matches(['\r', '\n']);

        // Shortcut for mock/simple JSON-RPC servers outputting raw JSON lines
        if content_length.is_none() && trimmed.starts_with('{') {
            return Ok(Some(trimmed.as_bytes().to_vec()));
        }

        if trimmed.is_empty() {
            // Blank line indicates end of headers
            break;
        }

        let lower = trimmed.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix("content-length:") {
            if let Ok(len) = rest.trim().parse::<usize>() {
                content_length = Some(len);
            }
        }
    }

    if let Some(len) = content_length {
        let mut body = vec![0u8; len];
        reader.read_exact(&mut body).await?;
        Ok(Some(body))
    } else {
        Ok(None)
    }
}

/// Starts an ephemeral WebSocket LSP proxy for the specified language server binary.
/// Returns a handle containing the assigned ephemeral port and a cancellation token.
pub async fn start_lsp_proxy_handle(
    _language: &str,
    lsp_binary: &str,
    args: &[&str],
    shutdown: Option<CancellationToken>,
) -> Result<LspProxyHandle, LspError> {
    // 1. Bind ephemeral localhost TCP listener
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| LspError::ServerBindFailed(e.to_string()))?;
    let port = listener
        .local_addr()
        .map_err(|e| LspError::ServerBindFailed(e.to_string()))?
        .port();

    // 2. Spawn LSP child process immediately to fail fast on missing binary
    let mut child = Command::new(lsp_binary)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                LspError::BinaryNotFound(lsp_binary.to_string())
            } else {
                LspError::ProcessSpawnFailed(format!("{}: {}", lsp_binary, e))
            }
        })?;

    let mut child_stdin = child
        .stdin
        .take()
        .ok_or_else(|| LspError::ProcessSpawnFailed("Failed to capture LSP stdin".into()))?;
    let child_stdout = child
        .stdout
        .take()
        .ok_or_else(|| LspError::ProcessSpawnFailed("Failed to capture LSP stdout".into()))?;

    let token = shutdown.unwrap_or_default();
    let token_clone = token.clone();

    // 3. Spawn background proxy task
    tokio::spawn(async move {
        // Wait for incoming WebSocket connection or cancellation
        let (tcp_stream, _) = tokio::select! {
            _ = token_clone.cancelled() => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                return;
            }
            res = listener.accept() => {
                match res {
                    Ok(conn) => conn,
                    Err(_) => {
                        let _ = child.kill().await;
                        let _ = child.wait().await;
                        return;
                    }
                }
            }
        };

        // Upgrade TCP stream to WebSocket
        let ws_stream = match tokio_tungstenite::accept_async(tcp_stream).await {
            Ok(ws) => ws,
            Err(_) => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                return;
            }
        };

        let (mut ws_writer, mut ws_reader) = ws_stream.split();

        // Task: Incoming WebSocket frames -> LSP child stdin
        let token_in = token_clone.clone();
        let in_task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = token_in.cancelled() => {
                        break;
                    }
                    msg_opt = ws_reader.next() => {
                        match msg_opt {
                            Some(Ok(Message::Text(text))) => {
                                let write_res = if text
                                    .trim_start()
                                    .to_ascii_lowercase()
                                    .starts_with("content-length:")
                                {
                                    child_stdin.write_all(text.as_bytes()).await
                                } else {
                                    let header = format!(
                                        "Content-Length: {}\r\n\r\n",
                                        text.len()
                                    );
                                    if child_stdin.write_all(header.as_bytes()).await.is_err() {
                                        break;
                                    }
                                    child_stdin.write_all(text.as_bytes()).await
                                };

                                if write_res.is_err() || child_stdin.flush().await.is_err() {
                                    break;
                                }
                            }
                            Some(Ok(Message::Binary(bytes))) => {
                                let write_res = if bytes.starts_with(b"Content-Length:") {
                                    child_stdin.write_all(&bytes).await
                                } else {
                                    let header = format!("Content-Length: {}\r\n\r\n", bytes.len());
                                    if child_stdin.write_all(header.as_bytes()).await.is_err() {
                                        break;
                                    }
                                    child_stdin.write_all(&bytes).await
                                };

                                if write_res.is_err() || child_stdin.flush().await.is_err() {
                                    break;
                                }
                            }
                            Some(Ok(Message::Close(_))) => {
                                break;
                            }
                            Some(Ok(Message::Ping(_))) => {}
                            Some(Ok(_)) => {}
                            Some(Err(_)) | None => {
                                break;
                            }
                        }
                    }
                }
            }
        });

        // Task: LSP child stdout -> outgoing WebSocket frames
        let token_out = token_clone.clone();
        let mut buf_stdout = BufReader::new(child_stdout);
        let out_task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = token_out.cancelled() => {
                        break;
                    }
                    frame_res = read_lsp_frame(&mut buf_stdout) => {
                        match frame_res {
                            Ok(Some(body)) => {
                                let msg = match String::from_utf8(body) {
                                    Ok(text) => Message::Text(text.into()),
                                    Err(err) => Message::Binary(err.into_bytes().into()),
                                };
                                if ws_writer.send(msg).await.is_err() {
                                    break;
                                }
                            }
                            Ok(None) | Err(_) => {
                                break;
                            }
                        }
                    }
                }
            }
            let _ = ws_writer.close().await;
        });

        // Monitor tasks, child process exit, or cancellation
        tokio::select! {
            _ = token_clone.cancelled() => {}
            _ = in_task => {}
            _ = out_task => {}
            _ = child.wait() => {}
        }

        // Clean teardown
        token_clone.cancel();
        let _ = child.kill().await;
        let _ = child.wait().await;
    });

    Ok(LspProxyHandle {
        port,
        cancellation_token: token,
    })
}

/// Starts an ephemeral WebSocket LSP proxy for the specified language server binary.
/// Returns the assigned localhost ephemeral port.
pub async fn start_lsp_proxy(
    language: &str,
    lsp_binary: &str,
    args: &[&str],
) -> Result<u16, LspError> {
    let handle = start_lsp_proxy_handle(language, lsp_binary, args, None).await?;
    Ok(handle.port)
}

/// Starts an ephemeral WebSocket LSP proxy with an explicit cancellation token.
pub async fn start_lsp_proxy_with_shutdown(
    language: &str,
    lsp_binary: &str,
    args: &[&str],
    shutdown: Option<CancellationToken>,
) -> Result<u16, LspError> {
    let handle = start_lsp_proxy_handle(language, lsp_binary, args, shutdown).await?;
    Ok(handle.port)
}
