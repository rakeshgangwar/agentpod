//! OpenCode commands
//!
//! Tauri commands for interacting with OpenCode containers via the Management API.
//! All communication goes through the Management API proxy.

use crate::models::{
    AppError, AppInfo, FileContent, FileNode, Message, MessagePartInput, MessagePartType,
    OpenCodeHealth, SendMessageInput, Session,
};
use crate::services::{api::ApiClient, storage::StorageService};

/// Helper to get an authenticated API client
fn get_client() -> Result<ApiClient, AppError> {
    let config = StorageService::load_config()?.ok_or(AppError::NotConnected)?;
    ApiClient::new(&config)
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
            part_type: MessagePartType::Text,
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
        part_type: MessagePartType::Text,
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
            part_type: MessagePartType::File,
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

/// List files in a project
#[tauri::command]
pub async fn opencode_list_files(project_id: String) -> Result<Vec<FileNode>, AppError> {
    let client = get_client()?;
    client.opencode_list_files(&project_id).await
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
