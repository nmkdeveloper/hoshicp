use hoshicp_lib::server::companion::{parse_companion_json, start_companion_server};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;

#[test]
fn test_parse_companion_json_valid_payload() {
    let json_data = r#"{
        "name": "A. Way Too Long Words",
        "group": "Codeforces - Beta Round 65",
        "url": "https://codeforces.com/contest/71/problem/A",
        "timeLimit": 1000,
        "memoryLimit": 256,
        "tests": [
            {"input": "4\nword\nlocalization\ninternationalization\npneumonoultramicroscopicsilicovolcanoconiosis\n", "output": "word\nl10n\ni18n\np43s\n"}
        ]
    }"#;
    let problem_data = parse_companion_json(json_data).expect("Should parse");
    assert_eq!(problem_data.problem.name, "A. Way Too Long Words");
    assert_eq!(problem_data.problem.group, "Codeforces - Beta Round 65");
    assert_eq!(problem_data.problem.url, "https://codeforces.com/contest/71/problem/A");
    assert_eq!(problem_data.problem.time_limit, 1000);
    assert_eq!(problem_data.problem.memory_limit, 256);
    assert_eq!(problem_data.testcases.len(), 1);
    assert_eq!(problem_data.testcases[0].id, "1");
    assert!(!problem_data.testcases[0].custom);
    assert!(problem_data.testcases[0].input.starts_with("4\nword"));
    assert_eq!(problem_data.testcases[0].output, "word\nl10n\ni18n\np43s\n");
}

#[test]
fn test_parse_companion_json_defaults() {
    let json_data = r#"{
        "name": "Sample Problem"
    }"#;
    let problem_data = parse_companion_json(json_data).expect("Should parse defaults");
    assert_eq!(problem_data.problem.name, "Sample Problem");
    assert_eq!(problem_data.problem.group, "");
    assert_eq!(problem_data.problem.url, "");
    assert_eq!(problem_data.problem.time_limit, 2000);
    assert_eq!(problem_data.problem.memory_limit, 256);
    assert_eq!(problem_data.testcases.len(), 0);
}

#[test]
fn test_parse_companion_json_invalid_payload() {
    let invalid_json = "{ invalid json }";
    assert!(parse_companion_json(invalid_json).is_err());

    let missing_name = r#"{"group": "Codeforces"}"#;
    assert!(parse_companion_json(missing_name).is_err());
}

async fn send_raw_http(port: u16, raw_request: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .await
        .expect("Should connect to server");
    stream.write_all(raw_request.as_bytes()).await.expect("Write failed");
    let mut response = String::new();
    stream.read_to_string(&mut response).await.expect("Read failed");
    response
}

#[tokio::test]
async fn test_server_post_and_cors_headers() {
    let (tx, mut rx) = mpsc::unbounded_channel();
    // Port 0 lets the OS pick an available ephemeral port
    let (bound_port, handle) = start_companion_server(tx, 0, 0)
        .await
        .expect("Server should start");

    let payload = r#"{
        "name": "B. Two Buttons",
        "group": "Codeforces",
        "url": "https://codeforces.com/contest/520/problem/B",
        "timeLimit": 2000,
        "memoryLimit": 256,
        "tests": [
            {"input": "4 6\n", "output": "2\n"}
        ]
    }"#;

    let request = format!(
        "POST / HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        bound_port,
        payload.len(),
        payload
    );

    let response = send_raw_http(bound_port, &request).await;
    assert!(response.starts_with("HTTP/1.1 200 OK"));
    assert!(response.to_lowercase().contains("access-control-allow-origin: *"));

    let received = tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("Should receive emitted problem")
        .expect("Channel should not be closed");

    assert_eq!(received.problem.name, "B. Two Buttons");
    assert_eq!(received.testcases.len(), 1);
    assert_eq!(received.testcases[0].input, "4 6\n");

    handle.abort();
}

#[tokio::test]
async fn test_server_options_preflight() {
    let (tx, _rx) = mpsc::unbounded_channel();
    let (bound_port, handle) = start_companion_server(tx, 0, 0)
        .await
        .expect("Server should start");

    let request = format!(
        "OPTIONS / HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nAccess-Control-Request-Method: POST\r\nConnection: close\r\n\r\n",
        bound_port
    );

    let response = send_raw_http(bound_port, &request).await;
    assert!(response.starts_with("HTTP/1.1 200 OK"));
    assert!(response.to_lowercase().contains("access-control-allow-origin: *"));
    assert!(response.to_lowercase().contains("access-control-allow-methods: post, options"));

    handle.abort();
}

#[tokio::test]
async fn test_server_port_fallback() {
    // Intentionally occupy the primary port
    let primary_listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Primary bind should succeed");
    let occupied_port = primary_listener.local_addr().unwrap().port();

    let (tx, _rx) = mpsc::unbounded_channel();
    // Primary is occupied, secondary port is 0 (OS allocates ephemeral port)
    let (bound_port, handle) = start_companion_server(tx, occupied_port, 0)
        .await
        .expect("Fallback to secondary should succeed");

    assert_ne!(bound_port, occupied_port);

    let request = format!(
        "OPTIONS / HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
        bound_port
    );
    let response = send_raw_http(bound_port, &request).await;
    assert!(response.starts_with("HTTP/1.1 200 OK"));

    handle.abort();
    drop(primary_listener);
}

#[tokio::test]
async fn test_server_concurrent_payload_ingestion() {
    // Review Focus #3: Graceful concurrent ingestion
    let (tx, mut rx) = mpsc::unbounded_channel();
    let (bound_port, handle) = start_companion_server(tx, 0, 0)
        .await
        .expect("Server should start");

    let num_concurrent = 10;
    let mut join_set = tokio::task::JoinSet::new();

    for i in 0..num_concurrent {
        let port = bound_port;
        let payload = format!(
            r#"{{
                "name": "Problem {}",
                "group": "Contest 100",
                "url": "https://example.com/{}",
                "timeLimit": 1000,
                "memoryLimit": 256,
                "tests": [{{"input": "{}\n", "output": "{}\n"}}]
            }}"#,
            i, i, i, i
        );

        join_set.spawn(async move {
            let req = format!(
                "POST / HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                port,
                payload.len(),
                payload
            );
            send_raw_http(port, &req).await
        });
    }

    // Wait for all HTTP requests to finish and assert 200 OK
    while let Some(res) = join_set.join_next().await {
        let resp = res.expect("Join error");
        assert!(resp.starts_with("HTTP/1.1 200 OK"));
    }

    // Drain all emitted problems from the channel
    let mut received_names = Vec::new();
    for _ in 0..num_concurrent {
        let item = tokio::time::timeout(Duration::from_secs(2), rx.recv())
            .await
            .expect("Timed out waiting for concurrent item")
            .expect("Channel closed prematurely");
        received_names.push(item.problem.name);
    }

    assert_eq!(received_names.len(), num_concurrent);
    for i in 0..num_concurrent {
        assert!(received_names.contains(&format!("Problem {}", i)));
    }

    handle.abort();
}

#[tokio::test]
async fn test_server_post_invalid_json() {
    let (tx, mut rx) = mpsc::unbounded_channel();
    let (bound_port, handle) = start_companion_server(tx, 0, 0)
        .await
        .expect("Server should start");

    let bad_payload = "not valid json";
    let request = format!(
        "POST / HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        bound_port,
        bad_payload.len(),
        bad_payload
    );

    let response = send_raw_http(bound_port, &request).await;
    assert!(response.starts_with("HTTP/1.1 400 Bad Request"));
    assert!(response.to_lowercase().contains("access-control-allow-origin: *"));

    // Ensure nothing was emitted
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert!(rx.try_recv().is_err());

    handle.abort();
}
