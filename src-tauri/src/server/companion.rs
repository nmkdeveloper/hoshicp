use std::sync::Arc;
use axum::{
    extract::{Request, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Router,
};
use serde::Deserialize;
use tokio::task::JoinHandle;

use crate::error::AppError;
use crate::models::{ProblemMetadata, SidecarData, TestCase};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompanionPayload {
    name: String,
    #[serde(default)]
    group: String,
    #[serde(default)]
    url: String,
    #[serde(default, alias = "time_limit")]
    time_limit: Option<f64>,
    #[serde(default, alias = "memory_limit")]
    memory_limit: Option<f64>,
    #[serde(default, alias = "testcases", alias = "testCases")]
    tests: Vec<CompanionTestCase>,
}

#[derive(Debug, Deserialize)]
struct CompanionTestCase {
    #[serde(default)]
    input: String,
    #[serde(default)]
    output: String,
}

pub fn parse_companion_json(payload: &str) -> Result<SidecarData, AppError> {
    let raw: CompanionPayload = serde_json::from_str(payload)?;
    let testcases = raw
        .tests
        .into_iter()
        .enumerate()
        .map(|(i, t)| TestCase {
            id: (i + 1).to_string(),
            input: t.input,
            output: t.output,
            custom: false,
        })
        .collect();

    Ok(SidecarData {
        problem: ProblemMetadata {
            name: raw.name,
            group: raw.group,
            url: raw.url,
            time_limit: raw.time_limit.map(|v| v.round() as u64).unwrap_or(2000),
            memory_limit: raw.memory_limit.map(|v| v.round() as u64).unwrap_or(256),
        },
        testcases,
    })
}

pub trait TauriEmitter: Send + Sync + 'static {
    fn emit_new_problem(&self, data: SidecarData) -> Result<(), AppError>;
}

pub use TauriEmitter as CompanionEmitter;

impl TauriEmitter for tauri::AppHandle {
    fn emit_new_problem(&self, data: SidecarData) -> Result<(), AppError> {
        use tauri::Emitter;
        self.emit("companion:new_problem", &data)
            .map_err(|e| AppError::Generic(format!("Tauri emit error: {}", e)))
    }
}

impl TauriEmitter for tokio::sync::mpsc::Sender<SidecarData> {
    fn emit_new_problem(&self, data: SidecarData) -> Result<(), AppError> {
        self.try_send(data)
            .map_err(|e| AppError::Generic(format!("Mpsc sender error: {}", e)))
    }
}

impl TauriEmitter for tokio::sync::mpsc::UnboundedSender<SidecarData> {
    fn emit_new_problem(&self, data: SidecarData) -> Result<(), AppError> {
        self.send(data)
            .map_err(|e| AppError::Generic(format!("Mpsc unbounded sender error: {}", e)))
    }
}

impl<E: TauriEmitter + ?Sized> TauriEmitter for Arc<E> {
    fn emit_new_problem(&self, data: SidecarData) -> Result<(), AppError> {
        (**self).emit_new_problem(data)
    }
}

fn cors_response(status: StatusCode, body: &'static str) -> Response {
    (
        status,
        [
            (header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*")),
            (header::ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("POST, OPTIONS")),
            (header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("*")),
        ],
        body,
    ).into_response()
}

async fn handle_options() -> Response {
    cors_response(StatusCode::OK, "")
}

async fn handle_post<E: TauriEmitter>(
    State(emitter): State<Arc<E>>,
    body: String,
) -> Response {
    match parse_companion_json(&body) {
        Ok(data) => {
            if let Err(_err) = emitter.emit_new_problem(data) {
                return cors_response(StatusCode::INTERNAL_SERVER_ERROR, "Failed to emit problem");
            }
            cors_response(StatusCode::OK, "OK")
        }
        Err(_) => cors_response(StatusCode::BAD_REQUEST, "Invalid companion payload"),
    }
}

async fn handle_fallback(req: Request) -> Response {
    if req.method() == axum::http::Method::OPTIONS {
        cors_response(StatusCode::OK, "")
    } else {
        cors_response(StatusCode::NOT_FOUND, "Not Found")
    }
}

pub async fn start_companion_server<E: TauriEmitter>(
    emitter: E,
    primary_port: u16,
    secondary_port: u16,
) -> Result<(u16, JoinHandle<()>), AppError> {
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", primary_port)).await {
        Ok(l) => l,
        Err(err1) => {
            tokio::net::TcpListener::bind(("127.0.0.1", secondary_port))
                .await
                .map_err(|err2| {
                    AppError::Generic(format!(
                        "Failed to bind companion server to 127.0.0.1:{} ({}) and fallback 127.0.0.1:{} ({})",
                        primary_port, err1, secondary_port, err2
                    ))
                })?
        }
    };

    let bound_port = listener.local_addr()?.port();
    let state = Arc::new(emitter);
    let app = Router::new()
        .route("/", post(handle_post::<E>).options(handle_options))
        .fallback(handle_fallback)
        .with_state(state);

    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    Ok((bound_port, handle))
}
