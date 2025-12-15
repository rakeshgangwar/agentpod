//! Terminal WebSocket proxy commands
//!
//! Provides bidirectional WebSocket communication between the frontend
//! and the Management API's terminal endpoint. This enables interactive
//! shell access to sandbox containers.
//!
//! Architecture:
//! - Frontend calls `terminal_connect` to start a terminal session
//! - Tauri establishes a WebSocket connection to the API
//! - Input from frontend is sent via `terminal_send_input`
//! - Output from the container is emitted as "terminal:output" events
//! - Terminal can be resized via `terminal_resize`
//! - Session is closed via `terminal_disconnect`

use crate::models::AppError;
use crate::services::{ApiClient, auth::AuthService};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

// =============================================================================
// Types
// =============================================================================

/// Terminal connection info returned when connecting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalConnection {
    /// Unique terminal session ID
    pub terminal_id: String,
    /// Associated sandbox ID
    pub sandbox_id: String,
}

/// Message sent from client to server
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    #[serde(rename = "input")]
    Input { data: String },
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
}

/// Message received from server
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    #[serde(rename = "output")]
    Output { data: String },
    #[serde(rename = "connected")]
    Connected { shell: Option<String> },
    #[serde(rename = "exit")]
    Exit { code: Option<i32> },
    #[serde(rename = "error")]
    Error { message: String },
}

/// Terminal status for frontend events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TerminalStatus {
    Connecting,
    Connected,
    Disconnected,
    Error,
}

/// Payload emitted for terminal output events
#[derive(Debug, Clone, Serialize)]
pub struct TerminalOutputPayload {
    pub terminal_id: String,
    pub sandbox_id: String,
    pub data: String,
}

/// Payload emitted for terminal status events
#[derive(Debug, Clone, Serialize)]
pub struct TerminalStatusPayload {
    pub terminal_id: String,
    pub sandbox_id: String,
    pub status: TerminalStatus,
    pub shell: Option<String>,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
}

/// Internal handle for managing a terminal connection
struct TerminalHandle {
    /// Sender for sending messages to the WebSocket
    tx: mpsc::Sender<ClientMessage>,
    /// Abort handle to stop the connection
    abort_tx: tokio::sync::oneshot::Sender<()>,
    /// Sandbox ID
    sandbox_id: String,
}

/// State for managing active terminal connections
type TerminalConnections = Arc<RwLock<HashMap<String, TerminalHandle>>>;

// =============================================================================
// State Management
// =============================================================================

/// Get or create the terminal connections state
fn get_terminal_state(app: &AppHandle) -> TerminalConnections {
    if let Some(state) = app.try_state::<TerminalConnections>() {
        state.inner().clone()
    } else {
        let state = Arc::new(RwLock::new(HashMap::new()));
        app.manage(state.clone());
        state
    }
}

// =============================================================================
// Commands
// =============================================================================

/// Connect to a terminal session for a sandbox
///
/// This establishes a WebSocket connection to the Management API and starts
/// forwarding terminal I/O. Returns a TerminalConnection with the terminal_id.
///
/// Events emitted:
/// - "terminal:status" - Connection status changes
/// - "terminal:output" - Terminal output data
#[tauri::command]
pub async fn terminal_connect(
    app: AppHandle,
    sandbox_id: String,
) -> Result<TerminalConnection, AppError> {
    let terminal_id = uuid::Uuid::new_v4().to_string();
    let terminal_id_clone = terminal_id.clone();
    let sandbox_id_clone = sandbox_id.clone();

    // Get the API client to build the WebSocket URL
    let client = ApiClient::new()?;
    let base_url = client.base_url();

    // Convert HTTP URL to WebSocket URL
    let ws_url = if base_url.starts_with("https://") {
        format!(
            "wss://{}/api/v2/sandboxes/{}/terminal",
            &base_url[8..],
            sandbox_id
        )
    } else if base_url.starts_with("http://") {
        format!(
            "ws://{}/api/v2/sandboxes/{}/terminal",
            &base_url[7..],
            sandbox_id
        )
    } else {
        return Err(AppError::InvalidConfig("Invalid API URL format".to_string()));
    };

    tracing::info!("Connecting to terminal WebSocket: {}", ws_url);

    // Emit connecting status
    let _ = app.emit(
        "terminal:status",
        TerminalStatusPayload {
            terminal_id: terminal_id.clone(),
            sandbox_id: sandbox_id.clone(),
            status: TerminalStatus::Connecting,
            shell: None,
            exit_code: None,
            error: None,
        },
    );

    // Get auth token for WebSocket connection
    let auth_token = AuthService::get_token()
        .ok()
        .flatten();

    // Build WebSocket request using IntoClientRequest trait
    // This properly generates all required WebSocket headers (Sec-WebSocket-Key, etc.)
    let mut request = ws_url.into_client_request()
        .map_err(|e| AppError::InvalidConfig(format!("Failed to build WebSocket request: {}", e)))?;
    
    // Add custom headers
    let headers = request.headers_mut();
    headers.insert("Sec-WebSocket-Protocol", "terminal".parse().unwrap());
    
    if let Some(token) = auth_token {
        headers.insert("Authorization", format!("Bearer {}", token).parse().unwrap());
    }

    // Connect to WebSocket
    let (ws_stream, _response) = connect_async(request)
        .await
        .map_err(|e| {
            tracing::error!("WebSocket connection failed: {}", e);
            AppError::ConnectionFailed(format!("WebSocket connection failed: {}", e))
        })?;

    tracing::info!("WebSocket connected for terminal {}", terminal_id);

    let (mut ws_write, mut ws_read) = ws_stream.split();

    // Create channels for communication
    let (input_tx, mut input_rx) = mpsc::channel::<ClientMessage>(32);
    let (abort_tx, mut abort_rx) = tokio::sync::oneshot::channel::<()>();

    // Store the terminal handle
    let state = get_terminal_state(&app);
    {
        let mut connections = state.write().await;
        connections.insert(
            terminal_id.clone(),
            TerminalHandle {
                tx: input_tx,
                abort_tx,
                sandbox_id: sandbox_id.clone(),
            },
        );
    }

    // Spawn task to handle WebSocket I/O
    let app_clone = app.clone();
    let state_clone = state.clone();
    let terminal_id_for_task = terminal_id.clone();
    let sandbox_id_for_task = sandbox_id.clone();

    tokio::spawn(async move {
        let terminal_id = terminal_id_for_task;
        let sandbox_id = sandbox_id_for_task;

        loop {
            tokio::select! {
                // Check for abort signal
                _ = &mut abort_rx => {
                    tracing::info!("Terminal {} aborted", terminal_id);
                    break;
                }

                // Handle outgoing messages (from frontend to server)
                Some(msg) = input_rx.recv() => {
                    let json = match serde_json::to_string(&msg) {
                        Ok(j) => j,
                        Err(e) => {
                            tracing::error!("Failed to serialize message: {}", e);
                            continue;
                        }
                    };

                    if let Err(e) = ws_write.send(Message::Text(json)).await {
                        tracing::error!("Failed to send WebSocket message: {}", e);
                        break;
                    }
                }

                // Handle incoming messages (from server to frontend)
                Some(msg_result) = ws_read.next() => {
                    match msg_result {
                        Ok(Message::Text(text)) => {
                            match serde_json::from_str::<ServerMessage>(&text) {
                                Ok(ServerMessage::Output { data }) => {
                                    let _ = app_clone.emit(
                                        "terminal:output",
                                        TerminalOutputPayload {
                                            terminal_id: terminal_id.clone(),
                                            sandbox_id: sandbox_id.clone(),
                                            data,
                                        },
                                    );
                                }
                                Ok(ServerMessage::Connected { shell }) => {
                                    tracing::info!("Terminal {} connected with shell: {:?}", terminal_id, shell);
                                    let _ = app_clone.emit(
                                        "terminal:status",
                                        TerminalStatusPayload {
                                            terminal_id: terminal_id.clone(),
                                            sandbox_id: sandbox_id.clone(),
                                            status: TerminalStatus::Connected,
                                            shell,
                                            exit_code: None,
                                            error: None,
                                        },
                                    );
                                }
                                Ok(ServerMessage::Exit { code }) => {
                                    tracing::info!("Terminal {} exited with code: {:?}", terminal_id, code);
                                    let _ = app_clone.emit(
                                        "terminal:status",
                                        TerminalStatusPayload {
                                            terminal_id: terminal_id.clone(),
                                            sandbox_id: sandbox_id.clone(),
                                            status: TerminalStatus::Disconnected,
                                            shell: None,
                                            exit_code: code,
                                            error: None,
                                        },
                                    );
                                    break;
                                }
                                Ok(ServerMessage::Error { message }) => {
                                    tracing::error!("Terminal {} error: {}", terminal_id, message);
                                    let _ = app_clone.emit(
                                        "terminal:status",
                                        TerminalStatusPayload {
                                            terminal_id: terminal_id.clone(),
                                            sandbox_id: sandbox_id.clone(),
                                            status: TerminalStatus::Error,
                                            shell: None,
                                            exit_code: None,
                                            error: Some(message),
                                        },
                                    );
                                }
                                Err(e) => {
                                    tracing::warn!("Failed to parse server message: {} - {}", e, text);
                                }
                            }
                        }
                        Ok(Message::Binary(data)) => {
                            // Binary data is treated as raw terminal output
                            let data_str = String::from_utf8_lossy(&data).to_string();
                            let _ = app_clone.emit(
                                "terminal:output",
                                TerminalOutputPayload {
                                    terminal_id: terminal_id.clone(),
                                    sandbox_id: sandbox_id.clone(),
                                    data: data_str,
                                },
                            );
                        }
                        Ok(Message::Close(_)) => {
                            tracing::info!("Terminal {} WebSocket closed by server", terminal_id);
                            break;
                        }
                        Ok(Message::Ping(data)) => {
                            let _ = ws_write.send(Message::Pong(data)).await;
                        }
                        Ok(_) => {
                            // Ignore other message types
                        }
                        Err(e) => {
                            tracing::error!("Terminal {} WebSocket error: {}", terminal_id, e);
                            let _ = app_clone.emit(
                                "terminal:status",
                                TerminalStatusPayload {
                                    terminal_id: terminal_id.clone(),
                                    sandbox_id: sandbox_id.clone(),
                                    status: TerminalStatus::Error,
                                    shell: None,
                                    exit_code: None,
                                    error: Some(e.to_string()),
                                },
                            );
                            break;
                        }
                    }
                }

                else => {
                    // Both channels closed
                    break;
                }
            }
        }

        // Cleanup: remove from state and emit disconnected status
        {
            let mut connections = state_clone.write().await;
            connections.remove(&terminal_id);
        }

        let _ = app_clone.emit(
            "terminal:status",
            TerminalStatusPayload {
                terminal_id: terminal_id.clone(),
                sandbox_id: sandbox_id.clone(),
                status: TerminalStatus::Disconnected,
                shell: None,
                exit_code: None,
                error: None,
            },
        );

        // Close WebSocket
        let _ = ws_write.close().await;
    });

    Ok(TerminalConnection {
        terminal_id: terminal_id_clone,
        sandbox_id: sandbox_id_clone,
    })
}

/// Send input to a terminal session
#[tauri::command]
pub async fn terminal_send_input(
    app: AppHandle,
    terminal_id: String,
    data: String,
) -> Result<(), AppError> {
    let state = get_terminal_state(&app);
    let connections = state.read().await;

    if let Some(handle) = connections.get(&terminal_id) {
        handle
            .tx
            .send(ClientMessage::Input { data })
            .await
            .map_err(|e| AppError::ApiError(format!("Failed to send input: {}", e)))?;
        Ok(())
    } else {
        Err(AppError::ApiError(format!(
            "Terminal not found: {}",
            terminal_id
        )))
    }
}

/// Resize a terminal session
#[tauri::command]
pub async fn terminal_resize(
    app: AppHandle,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    let state = get_terminal_state(&app);
    let connections = state.read().await;

    if let Some(handle) = connections.get(&terminal_id) {
        handle
            .tx
            .send(ClientMessage::Resize { cols, rows })
            .await
            .map_err(|e| AppError::ApiError(format!("Failed to send resize: {}", e)))?;
        Ok(())
    } else {
        Err(AppError::ApiError(format!(
            "Terminal not found: {}",
            terminal_id
        )))
    }
}

/// Disconnect from a terminal session
#[tauri::command]
pub async fn terminal_disconnect(app: AppHandle, terminal_id: String) -> Result<(), AppError> {
    let state = get_terminal_state(&app);
    let mut connections = state.write().await;

    if let Some(handle) = connections.remove(&terminal_id) {
        // Send abort signal (ignore error if already closed)
        let _ = handle.abort_tx.send(());
        Ok(())
    } else {
        // Terminal not found, but that's OK - maybe already disconnected
        Ok(())
    }
}

/// List active terminal connections for a sandbox
#[tauri::command]
pub async fn terminal_list(app: AppHandle, sandbox_id: String) -> Result<Vec<String>, AppError> {
    let state = get_terminal_state(&app);
    let connections = state.read().await;

    let terminal_ids: Vec<String> = connections
        .iter()
        .filter(|(_, handle)| handle.sandbox_id == sandbox_id)
        .map(|(id, _)| id.clone())
        .collect();

    Ok(terminal_ids)
}

/// Disconnect all terminals for a sandbox
#[tauri::command]
pub async fn terminal_disconnect_all(app: AppHandle, sandbox_id: String) -> Result<(), AppError> {
    let state = get_terminal_state(&app);
    let mut connections = state.write().await;

    // Find and remove all terminals for this sandbox
    let terminals_to_remove: Vec<String> = connections
        .iter()
        .filter(|(_, handle)| handle.sandbox_id == sandbox_id)
        .map(|(id, _)| id.clone())
        .collect();

    for terminal_id in terminals_to_remove {
        if let Some(handle) = connections.remove(&terminal_id) {
            let _ = handle.abort_tx.send(());
        }
    }

    Ok(())
}
