//! OpenCode commands
//!
//! Tauri commands for interacting with OpenCode containers via the Management API.
//! All communication goes through the Management API proxy.

use crate::models::{
    AppError, AppInfo, FileContent, FileNode, Message, MessagePartInput,
    OpenCodeEvent, OpenCodeHealth, SendMessageInput, Session, StreamConnection,
    StreamEventPayload, StreamStatus, StreamStatusPayload,
};
use crate::services::ApiClient;
use futures::StreamExt;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

/// Helper to get an authenticated API client
fn get_client() -> Result<ApiClient, AppError> {
    ApiClient::new()
}

// =============================================================================
// App Info & Health
// =============================================================================

/// Get OpenCode app info for a project
#[tauri::command]
pub async fn opencode_get_app_info(project_id: String) -> Result<AppInfo, AppError> {
    let client = get_client()?;
    client.opencode_get_app_info(&project_id).await
}

/// Check if OpenCode container is healthy
#[tauri::command]
pub async fn opencode_health_check(project_id: String) -> Result<OpenCodeHealth, AppError> {
    let client = get_client()?;
    client.opencode_health_check(&project_id).await
}

// =============================================================================
// Sessions
// =============================================================================

/// List all sessions for a project
#[tauri::command]
pub async fn opencode_list_sessions(project_id: String) -> Result<Vec<Session>, AppError> {
    let client = get_client()?;
    client.opencode_list_sessions(&project_id).await
}

/// Create a new session for a project
#[tauri::command]
pub async fn opencode_create_session(project_id: String) -> Result<Session, AppError> {
    let client = get_client()?;
    client.opencode_create_session(&project_id).await
}

/// Get a session by ID
#[tauri::command]
pub async fn opencode_get_session(
    project_id: String,
    session_id: String,
) -> Result<Session, AppError> {
    let client = get_client()?;
    client.opencode_get_session(&project_id, &session_id).await
}

/// Delete a session
#[tauri::command]
pub async fn opencode_delete_session(project_id: String, session_id: String) -> Result<(), AppError> {
    let client = get_client()?;
    client
        .opencode_delete_session(&project_id, &session_id)
        .await
}

/// Abort a running session
#[tauri::command]
pub async fn opencode_abort_session(project_id: String, session_id: String) -> Result<(), AppError> {
    let client = get_client()?;
    client
        .opencode_abort_session(&project_id, &session_id)
        .await
}

// =============================================================================
// Messages
// =============================================================================

/// List messages in a session
#[tauri::command]
pub async fn opencode_list_messages(
    project_id: String,
    session_id: String,
) -> Result<Vec<Message>, AppError> {
    let client = get_client()?;
    client
        .opencode_list_messages(&project_id, &session_id)
        .await
}

/// Send a text message to a session
#[tauri::command]
pub async fn opencode_send_message(
    project_id: String,
    session_id: String,
    text: String,
) -> Result<Message, AppError> {
    let client = get_client()?;

    let input = SendMessageInput {
        parts: vec![MessagePartInput {
            part_type: "text".to_string(),
            text: Some(text),
            url: None,
            filename: None,
            mime: None,
        }],
    };

    client
        .opencode_send_message(&project_id, &session_id, input)
        .await
}

/// Send a message with file attachments
#[tauri::command]
pub async fn opencode_send_message_with_files(
    project_id: String,
    session_id: String,
    text: String,
    files: Vec<String>, // File paths
) -> Result<Message, AppError> {
    let client = get_client()?;

    let mut parts = vec![MessagePartInput {
        part_type: "text".to_string(),
        text: Some(text),
        url: None,
        filename: None,
        mime: None,
    }];

    // Add file parts
    for file_path in files {
        let filename = file_path
            .split('/')
            .last()
            .unwrap_or(&file_path)
            .to_string();

        parts.push(MessagePartInput {
            part_type: "file".to_string(),
            text: None,
            url: Some(format!("file://{}", file_path)),
            filename: Some(filename),
            mime: Some("text/plain".to_string()),
        });
    }

    let input = SendMessageInput { parts };

    client
        .opencode_send_message(&project_id, &session_id, input)
        .await
}

/// Get a specific message
#[tauri::command]
pub async fn opencode_get_message(
    project_id: String,
    session_id: String,
    message_id: String,
) -> Result<Message, AppError> {
    let client = get_client()?;
    client
        .opencode_get_message(&project_id, &session_id, &message_id)
        .await
}

// =============================================================================
// Files
// =============================================================================

/// List files in a project directory
#[tauri::command]
pub async fn opencode_list_files(project_id: String, path: Option<String>) -> Result<Vec<FileNode>, AppError> {
    let client = get_client()?;
    let path = path.unwrap_or_else(|| "/".to_string());
    client.opencode_list_files(&project_id, &path).await
}

/// Get file content
#[tauri::command]
pub async fn opencode_get_file_content(
    project_id: String,
    path: String,
) -> Result<FileContent, AppError> {
    let client = get_client()?;
    client.opencode_get_file_content(&project_id, &path).await
}

/// Find files by pattern
#[tauri::command]
pub async fn opencode_find_files(
    project_id: String,
    pattern: String,
) -> Result<Vec<String>, AppError> {
    let client = get_client()?;
    client.opencode_find_files(&project_id, &pattern).await
}

// =============================================================================
// SSE Event Streaming
// =============================================================================

/// Active stream connections - maps stream_id to abort handle
type StreamAbortHandles = Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>;

/// Get or create the stream abort handles state
fn get_stream_handles(app: &AppHandle) -> StreamAbortHandles {
    if let Some(handles) = app.try_state::<StreamAbortHandles>() {
        handles.inner().clone()
    } else {
        let handles = Arc::new(Mutex::new(HashMap::new()));
        app.manage(handles.clone());
        handles
    }
}

/// Connect to OpenCode SSE event stream
/// 
/// This starts a background task that:
/// 1. Connects to the Management API's SSE endpoint
/// 2. Emits "opencode:event" events to the frontend for each SSE message
/// 3. Emits "opencode:stream-status" events for connection status changes
/// 
/// Returns a StreamConnection with a unique stream_id that can be used to disconnect.
#[tauri::command]
pub async fn opencode_connect_stream(
    app: AppHandle,
    project_id: String,
) -> Result<StreamConnection, AppError> {
    let client = get_client()?;
    let stream_id = uuid::Uuid::new_v4().to_string();
    let stream_id_clone = stream_id.clone();
    let project_id_clone = project_id.clone();
    
    // Create abort channel
    let (abort_tx, mut abort_rx) = tokio::sync::oneshot::channel::<()>();
    
    // Store the abort handle
    let handles = get_stream_handles(&app);
    {
        let mut handles_guard = handles.lock().await;
        handles_guard.insert(stream_id.clone(), abort_tx);
    }
    
    // Get the stream URL and connect
    let response = client.opencode_connect_event_stream(&project_id).await?;
    
    // Spawn background task to process the stream
    let app_clone = app.clone();
    let handles_clone = handles.clone();
    
    tokio::spawn(async move {
        let stream_id = stream_id_clone;
        let project_id = project_id_clone;
        
        // Emit connected status
        let _ = app_clone.emit(
            "opencode:stream-status",
            StreamStatusPayload {
                stream_id: stream_id.clone(),
                project_id: project_id.clone(),
                status: StreamStatus::Connected,
                error: None,
            },
        );
        
        // Process the stream
        let mut bytes_stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut chunk_count = 0u64;
        let mut event_count = 0u64;
        
        tracing::info!("Starting SSE stream processing for project {}", project_id);
        
        loop {
            tokio::select! {
                // Check for abort signal
                _ = &mut abort_rx => {
                    tracing::info!("SSE stream aborted for project {}", project_id);
                    break;
                }
                
                // Process stream data
                chunk = bytes_stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            chunk_count += 1;
                            let text = String::from_utf8_lossy(&bytes);
                            tracing::debug!("SSE chunk #{} ({} bytes): {:?}", chunk_count, bytes.len(), 
                                if text.len() > 200 { format!("{}...", &text[..200]) } else { text.to_string() });
                            buffer.push_str(&text);
                            
                            // Process complete SSE events from buffer
                            while let Some(event) = parse_sse_event(&mut buffer) {
                                event_count += 1;
                                tracing::info!("Emitting SSE event #{}: type={}", event_count, event.event_type);
                                let emit_result = app_clone.emit(
                                    "opencode:event",
                                    StreamEventPayload {
                                        stream_id: stream_id.clone(),
                                        project_id: project_id.clone(),
                                        event,
                                    },
                                );
                                if let Err(e) = emit_result {
                                    tracing::error!("Failed to emit SSE event: {}", e);
                                }
                            }
                        }
                        Some(Err(e)) => {
                            tracing::error!("SSE stream error for project {}: {}", project_id, e);
                            // Emit error status
                            let _ = app_clone.emit(
                                "opencode:stream-status",
                                StreamStatusPayload {
                                    stream_id: stream_id.clone(),
                                    project_id: project_id.clone(),
                                    status: StreamStatus::Error,
                                    error: Some(e.to_string()),
                                },
                            );
                            break;
                        }
                        None => {
                            tracing::info!("SSE stream ended for project {} (chunks={}, events={})", 
                                project_id, chunk_count, event_count);
                            break;
                        }
                    }
                }
            }
        }
        
        // Clean up and emit disconnected status
        {
            let mut handles_guard = handles_clone.lock().await;
            handles_guard.remove(&stream_id);
        }
        
        let _ = app_clone.emit(
            "opencode:stream-status",
            StreamStatusPayload {
                stream_id: stream_id.clone(),
                project_id: project_id.clone(),
                status: StreamStatus::Disconnected,
                error: None,
            },
        );
    });
    
    Ok(StreamConnection {
        stream_id,
        project_id,
    })
}

/// Disconnect from an OpenCode SSE event stream
#[tauri::command]
pub async fn opencode_disconnect_stream(
    app: AppHandle,
    stream_id: String,
) -> Result<(), AppError> {
    let handles = get_stream_handles(&app);
    let mut handles_guard = handles.lock().await;
    
    if let Some(abort_tx) = handles_guard.remove(&stream_id) {
        // Send abort signal (ignore error if receiver is already dropped)
        let _ = abort_tx.send(());
    }
    
    Ok(())
}

/// Parse a single SSE event from the buffer, removing it from the buffer if found
fn parse_sse_event(buffer: &mut String) -> Option<OpenCodeEvent> {
    // SSE events are separated by double newlines
    if let Some(event_end) = buffer.find("\n\n") {
        let event_str = buffer[..event_end].to_string();
        buffer.drain(..event_end + 2);
        
        // Skip SSE comments (lines starting with ':')
        // The server sends ": connected" as a keep-alive/connection confirmation
        let is_comment = event_str.lines().all(|line| line.starts_with(':') || line.is_empty());
        if is_comment {
            tracing::debug!("Skipping SSE comment: {:?}", event_str);
            return None;
        }
        
        // Parse the SSE event
        let mut event_type = String::new();
        let mut data = String::new();
        
        for line in event_str.lines() {
            if let Some(value) = line.strip_prefix("event:") {
                event_type = value.trim().to_string();
            } else if let Some(value) = line.strip_prefix("data:") {
                if !data.is_empty() {
                    data.push('\n');
                }
                data.push_str(value.trim());
            }
            // Ignore comment lines starting with ':'
        }
        
        // If no data, skip this event
        if data.is_empty() {
            tracing::debug!("Skipping SSE event with no data: {:?}", event_str);
            return None;
        }
        
        // Store data length for logging before it might be moved
        let data_len = data.len();
        
        // Try to parse data as JSON
        let data_value = serde_json::from_str(&data).unwrap_or_else(|e| {
            tracing::warn!("Failed to parse SSE data as JSON: {} - data: {:?}", e, &data);
            serde_json::Value::String(data)
        });
        
        // If no event type specified via `event:` line, try to extract from JSON data
        // OpenCode sends events like: data: {"type":"message.part.updated","properties":{...}}
        if event_type.is_empty() {
            if let Some(obj) = data_value.as_object() {
                if let Some(type_val) = obj.get("type") {
                    if let Some(t) = type_val.as_str() {
                        event_type = t.to_string();
                    }
                }
            }
        }
        
        // Default to "message" if still no event type
        if event_type.is_empty() {
            event_type = "message".to_string();
        }
        
        tracing::debug!("Parsed SSE event: type={}, data_len={}", event_type, data_len);
        
        Some(OpenCodeEvent {
            event_type,
            data: data_value,
        })
    } else {
        None
    }
}
