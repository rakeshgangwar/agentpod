//! Sandbox management commands (v2 API)
//!
//! Commands for CRUD operations and container control for sandboxes.
//! These use the new direct Docker orchestration API instead of Coolify.

use crate::models::{
    AppError, CreateSandboxInput, DockerHealthResponse, ExecCommandInput, ExecResult,
    GitCommitInput, GitCommitResponse, GitLogResponse, GitStatusResponse, Sandbox,
    SandboxInfo, SandboxLogsResponse, SandboxStats, SandboxStatsResponse, SandboxWithRepo,
    SuccessResponse,
};
use crate::services::ApiClient;

/// Helper to get an authenticated API client
fn get_client() -> Result<ApiClient, AppError> {
    ApiClient::new()
}

// =============================================================================
// Docker Health
// =============================================================================

/// Check Docker health
#[tauri::command]
pub async fn docker_health() -> Result<DockerHealthResponse, AppError> {
    let client = get_client()?;
    client.get("/api/v2/health/docker").await
}

// =============================================================================
// Sandbox CRUD
// =============================================================================

/// List all sandboxes
#[tauri::command]
pub async fn list_sandboxes() -> Result<Vec<Sandbox>, AppError> {
    let client = get_client()?;
    let response: crate::models::SandboxListResponse = client.get("/api/v2/sandboxes").await?;
    Ok(response.sandboxes)
}

/// Get a sandbox by ID
#[tauri::command]
pub async fn get_sandbox(id: String) -> Result<SandboxInfo, AppError> {
    let client = get_client()?;
    client.get(&format!("/api/v2/sandboxes/{}", id)).await
}

/// Create a new sandbox
#[tauri::command]
pub async fn create_sandbox(
    name: String,
    description: Option<String>,
    github_url: Option<String>,
    user_id: String,
    flavor: Option<String>,
    resource_tier: Option<String>,
    addons: Option<Vec<String>>,
    auto_start: Option<bool>,
    provider: Option<String>,
) -> Result<SandboxWithRepo, AppError> {
    let client = get_client()?;
    
    let input = CreateSandboxInput {
        name,
        description,
        github_url,
        user_id,
        flavor,
        resource_tier,
        addons,
        auto_start,
        provider,
    };
    
    client.post("/api/v2/sandboxes", &input).await
}

/// Delete a sandbox
#[tauri::command]
pub async fn delete_sandbox(id: String) -> Result<(), AppError> {
    let client = get_client()?;
    let _: crate::models::SuccessResponse = client
        .delete(&format!("/api/v2/sandboxes/{}", id))
        .await?;
    Ok(())
}

// =============================================================================
// Sandbox Lifecycle
// =============================================================================

/// Start a sandbox
#[tauri::command]
pub async fn start_sandbox(id: String) -> Result<Sandbox, AppError> {
    let client = get_client()?;
    #[derive(serde::Deserialize)]
    struct Response {
        sandbox: Sandbox,
    }
    let response: Response = client
        .post(&format!("/api/v2/sandboxes/{}/start", id), &())
        .await?;
    Ok(response.sandbox)
}

/// Stop a sandbox
#[tauri::command]
pub async fn stop_sandbox(id: String) -> Result<Sandbox, AppError> {
    let client = get_client()?;
    #[derive(serde::Deserialize)]
    struct Response {
        sandbox: Sandbox,
    }
    let response: Response = client
        .post(&format!("/api/v2/sandboxes/{}/stop", id), &())
        .await?;
    Ok(response.sandbox)
}

/// Restart a sandbox
#[tauri::command]
pub async fn restart_sandbox(id: String) -> Result<Sandbox, AppError> {
    let client = get_client()?;
    #[derive(serde::Deserialize)]
    struct Response {
        sandbox: Sandbox,
    }
    let response: Response = client
        .post(&format!("/api/v2/sandboxes/{}/restart", id), &())
        .await?;
    Ok(response.sandbox)
}

/// Pause a sandbox
#[tauri::command]
pub async fn pause_sandbox(id: String) -> Result<Sandbox, AppError> {
    let client = get_client()?;
    #[derive(serde::Deserialize)]
    struct Response {
        sandbox: Sandbox,
    }
    let response: Response = client
        .post(&format!("/api/v2/sandboxes/{}/pause", id), &())
        .await?;
    Ok(response.sandbox)
}

/// Unpause a sandbox
#[tauri::command]
pub async fn unpause_sandbox(id: String) -> Result<Sandbox, AppError> {
    let client = get_client()?;
    #[derive(serde::Deserialize)]
    struct Response {
        sandbox: Sandbox,
    }
    let response: Response = client
        .post(&format!("/api/v2/sandboxes/{}/unpause", id), &())
        .await?;
    Ok(response.sandbox)
}

// =============================================================================
// Sandbox Monitoring
// =============================================================================

/// Get sandbox logs
#[tauri::command]
pub async fn get_sandbox_logs(id: String, tail: Option<u32>) -> Result<String, AppError> {
    let client = get_client()?;
    let url = match tail {
        Some(n) => format!("/api/v2/sandboxes/{}/logs?tail={}", id, n),
        None => format!("/api/v2/sandboxes/{}/logs", id),
    };
    let response: SandboxLogsResponse = client.get(&url).await?;
    Ok(response.logs)
}

/// Get sandbox resource stats
#[tauri::command]
pub async fn get_sandbox_stats(id: String) -> Result<SandboxStats, AppError> {
    let client = get_client()?;
    let response: SandboxStatsResponse = client
        .get(&format!("/api/v2/sandboxes/{}/stats", id))
        .await?;
    Ok(response.stats)
}

/// Get sandbox status
#[tauri::command]
pub async fn get_sandbox_status(id: String) -> Result<String, AppError> {
    let client = get_client()?;
    #[derive(serde::Deserialize)]
    struct Response {
        status: String,
    }
    let response: Response = client
        .get(&format!("/api/v2/sandboxes/{}/status", id))
        .await?;
    Ok(response.status)
}

// =============================================================================
// Command Execution
// =============================================================================

/// Execute a command in a sandbox
#[tauri::command]
pub async fn exec_in_sandbox(
    id: String,
    command: Vec<String>,
    working_dir: Option<String>,
) -> Result<ExecResult, AppError> {
    let client = get_client()?;
    let input = ExecCommandInput {
        command,
        working_dir,
    };
    client
        .post(&format!("/api/v2/sandboxes/{}/exec", id), &input)
        .await
}

// =============================================================================
// Git Operations
// =============================================================================

/// Get git status for a sandbox
#[tauri::command]
pub async fn get_sandbox_git_status(id: String) -> Result<GitStatusResponse, AppError> {
    let client = get_client()?;
    client
        .get(&format!("/api/v2/sandboxes/{}/git/status", id))
        .await
}

/// Get git log for a sandbox
#[tauri::command]
pub async fn get_sandbox_git_log(id: String) -> Result<GitLogResponse, AppError> {
    let client = get_client()?;
    client
        .get(&format!("/api/v2/sandboxes/{}/git/log", id))
        .await
}

/// Commit changes in a sandbox
#[tauri::command]
pub async fn commit_sandbox_changes(id: String, message: String) -> Result<GitCommitResponse, AppError> {
    let client = get_client()?;
    let input = GitCommitInput { message };
    client
        .post(&format!("/api/v2/sandboxes/{}/git/commit", id), &input)
        .await
}

// =============================================================================
// Git Branch Operations
// =============================================================================

use crate::models::{
    GitBranchesResponse, GitCheckoutInput, GitCreateBranchInput, 
    GitDiffResponse, GitFileDiffResponse,
};

/// List all branches in a sandbox's repository
#[tauri::command]
pub async fn list_sandbox_branches(id: String) -> Result<GitBranchesResponse, AppError> {
    let client = get_client()?;
    client
        .get(&format!("/api/v2/sandboxes/{}/git/branches", id))
        .await
}

/// Create a new branch in a sandbox's repository
#[tauri::command]
pub async fn create_sandbox_branch(
    id: String,
    name: String,
    from_ref: Option<String>,
) -> Result<(), AppError> {
    let client = get_client()?;
    let input = GitCreateBranchInput { name, from_ref };
    let _: SuccessResponse = client
        .post(&format!("/api/v2/sandboxes/{}/git/branches", id), &input)
        .await?;
    Ok(())
}

/// Checkout a branch in a sandbox's repository
#[tauri::command]
pub async fn checkout_sandbox_branch(id: String, branch: String) -> Result<(), AppError> {
    let client = get_client()?;
    let input = GitCheckoutInput { branch };
    let _: SuccessResponse = client
        .post(&format!("/api/v2/sandboxes/{}/git/checkout", id), &input)
        .await?;
    Ok(())
}

/// Delete a branch in a sandbox's repository
#[tauri::command]
pub async fn delete_sandbox_branch(id: String, branch: String) -> Result<(), AppError> {
    let client = get_client()?;
    // URL encode the branch name in case it contains slashes
    let encoded_branch = urlencoding::encode(&branch);
    let _: SuccessResponse = client
        .delete(&format!("/api/v2/sandboxes/{}/git/branches/{}", id, encoded_branch))
        .await?;
    Ok(())
}

// =============================================================================
// Git Diff Operations
// =============================================================================

/// Get diff summary for a sandbox's repository (list of changed files)
#[tauri::command]
pub async fn get_sandbox_diff(
    id: String,
    from_ref: Option<String>,
    to_ref: Option<String>,
) -> Result<GitDiffResponse, AppError> {
    let client = get_client()?;
    let mut url = format!("/api/v2/sandboxes/{}/git/diff", id);
    let mut params = Vec::new();
    
    if let Some(from) = from_ref {
        params.push(format!("from={}", urlencoding::encode(&from)));
    }
    if let Some(to) = to_ref {
        params.push(format!("to={}", urlencoding::encode(&to)));
    }
    
    if !params.is_empty() {
        url.push('?');
        url.push_str(&params.join("&"));
    }
    
    client.get(&url).await
}

/// Get detailed diff for a specific file with hunks
#[tauri::command]
pub async fn get_sandbox_file_diff(id: String, file_path: String) -> Result<GitFileDiffResponse, AppError> {
    let client = get_client()?;
    let encoded_path = urlencoding::encode(&file_path);
    client
        .get(&format!("/api/v2/sandboxes/{}/git/diff/file?path={}", id, encoded_path))
        .await
}

// =============================================================================
// OpenCode Integration (v2 Sandbox)
// =============================================================================

use crate::models::{
    AppInfo, FileContent, FileNode, Message, OpenCodeHealth, 
    SendMessageInput, Session,
};

/// Get OpenCode app info for a sandbox
#[tauri::command]
pub async fn sandbox_opencode_get_app_info(sandbox_id: String) -> Result<AppInfo, AppError> {
    let client = get_client()?;
    client
        .get(&format!("/api/v2/sandboxes/{}/opencode/app", sandbox_id))
        .await
}

/// Check if OpenCode is healthy in a sandbox
#[tauri::command]
pub async fn sandbox_opencode_health_check(sandbox_id: String) -> Result<OpenCodeHealth, AppError> {
    let client = get_client()?;
    client
        .get(&format!("/api/v2/sandboxes/{}/opencode/health", sandbox_id))
        .await
}

/// Get configured LLM providers for a sandbox
#[tauri::command]
pub async fn sandbox_opencode_get_providers(sandbox_id: String) -> Result<Vec<crate::models::OpenCodeProvider>, AppError> {
    let client = get_client()?;
    
    #[derive(serde::Deserialize)]
    struct Response {
        providers: Vec<crate::models::OpenCodeProvider>,
    }
    
    let response: Response = client
        .get(&format!("/api/v2/sandboxes/{}/opencode/providers", sandbox_id))
        .await?;
    Ok(response.providers)
}

/// Get available agents for a sandbox
#[tauri::command]
pub async fn sandbox_opencode_get_agents(sandbox_id: String) -> Result<Vec<crate::models::OpenCodeAgent>, AppError> {
    let client = get_client()?;
    
    #[derive(serde::Deserialize)]
    struct Response {
        agents: Vec<crate::models::OpenCodeAgent>,
    }
    
    let response: Response = client
        .get(&format!("/api/v2/sandboxes/{}/opencode/agents", sandbox_id))
        .await?;
    Ok(response.agents)
}

/// List all OpenCode sessions for a sandbox
#[tauri::command]
pub async fn sandbox_opencode_list_sessions(sandbox_id: String) -> Result<Vec<Session>, AppError> {
    let client = get_client()?;
    client
        .get(&format!("/api/v2/sandboxes/{}/opencode/session", sandbox_id))
        .await
}

/// Create a new OpenCode session in a sandbox
#[tauri::command]
pub async fn sandbox_opencode_create_session(sandbox_id: String, title: Option<String>) -> Result<Session, AppError> {
    let client = get_client()?;
    // Only include title if it's Some, otherwise send empty object
    let body = match title {
        Some(t) => serde_json::json!({ "title": t }),
        None => serde_json::json!({}),
    };
    client
        .post(&format!("/api/v2/sandboxes/{}/opencode/session", sandbox_id), &body)
        .await
}

/// Get an OpenCode session by ID
#[tauri::command]
pub async fn sandbox_opencode_get_session(sandbox_id: String, session_id: String) -> Result<Session, AppError> {
    let client = get_client()?;
    client
        .get(&format!("/api/v2/sandboxes/{}/opencode/session/{}", sandbox_id, session_id))
        .await
}

/// Delete an OpenCode session
#[tauri::command]
pub async fn sandbox_opencode_delete_session(sandbox_id: String, session_id: String) -> Result<(), AppError> {
    let client = get_client()?;
    let _: crate::models::SuccessResponse = client
        .delete(&format!("/api/v2/sandboxes/{}/opencode/session/{}", sandbox_id, session_id))
        .await?;
    Ok(())
}

/// Abort a running OpenCode session
#[tauri::command]
pub async fn sandbox_opencode_abort_session(sandbox_id: String, session_id: String) -> Result<(), AppError> {
    let client = get_client()?;
    let _: crate::models::SuccessResponse = client
        .post(&format!("/api/v2/sandboxes/{}/opencode/session/{}/abort", sandbox_id, session_id), &())
        .await?;
    Ok(())
}

/// Respond to an OpenCode permission request
#[tauri::command]
pub async fn sandbox_opencode_respond_permission(
    sandbox_id: String,
    session_id: String,
    permission_id: String,
    response: String,
) -> Result<bool, AppError> {
    let client = get_client()?;
    let body = serde_json::json!({ "response": response });
    let _: crate::models::SuccessResponse = client
        .post(
            &format!("/api/v2/sandboxes/{}/opencode/session/{}/permissions/{}", sandbox_id, session_id, permission_id),
            &body,
        )
        .await?;
    Ok(true)
}

/// Get pending permission requests for a session
/// This fetches cached permissions from the API that were received via SSE
/// but haven't been responded to yet. Useful after page refresh/reconnection.
#[tauri::command]
pub async fn sandbox_opencode_get_pending_permissions(
    sandbox_id: String,
    session_id: String,
) -> Result<Vec<crate::models::PermissionRequest>, AppError> {
    let client = get_client()?;
    
    #[derive(serde::Deserialize)]
    struct Response {
        permissions: Vec<crate::models::PermissionRequest>,
    }
    
    let response: Response = client
        .get(&format!(
            "/api/v2/sandboxes/{}/opencode/session/{}/permissions",
            sandbox_id, session_id
        ))
        .await?;
    Ok(response.permissions)
}

/// Get all pending permission requests across all sandboxes.
/// This is used by the home page to show a global view of pending actions.
#[tauri::command]
pub async fn get_all_pending_permissions() -> Result<Vec<crate::models::PendingPermission>, AppError> {
    let client = get_client()?;
    
    #[derive(serde::Deserialize)]
    struct Response {
        permissions: Vec<crate::models::PendingPermission>,
    }
    
    let response: Response = client
        .get("/api/v2/pending-actions/permissions")
        .await?;
    Ok(response.permissions)
}

/// Fork an OpenCode session at a specific message
/// Creates a new session that diverges from the original at the specified point.
#[tauri::command]
pub async fn sandbox_opencode_fork_session(
    sandbox_id: String,
    session_id: String,
    message_id: Option<String>,
) -> Result<Session, AppError> {
    let client = get_client()?;
    let body = match message_id {
        Some(id) => serde_json::json!({ "messageId": id }),
        None => serde_json::json!({}),
    };
    client
        .post(
            &format!("/api/v2/sandboxes/{}/opencode/session/{}/fork", sandbox_id, session_id),
            &body,
        )
        .await
}

/// Revert a message in an OpenCode session (undo)
/// Marks the message and all subsequent messages as reverted.
#[tauri::command]
pub async fn sandbox_opencode_revert_message(
    sandbox_id: String,
    session_id: String,
    message_id: String,
    part_id: Option<String>,
) -> Result<Session, AppError> {
    let client = get_client()?;
    let body = match part_id {
        Some(pid) => serde_json::json!({ "messageId": message_id, "partId": pid }),
        None => serde_json::json!({ "messageId": message_id }),
    };
    client
        .post(
            &format!("/api/v2/sandboxes/{}/opencode/session/{}/revert", sandbox_id, session_id),
            &body,
        )
        .await
}

/// Unrevert an OpenCode session (redo)
/// Restores all previously reverted messages.
#[tauri::command]
pub async fn sandbox_opencode_unrevert_session(
    sandbox_id: String,
    session_id: String,
) -> Result<Session, AppError> {
    let client = get_client()?;
    client
        .post(
            &format!("/api/v2/sandboxes/{}/opencode/session/{}/unrevert", sandbox_id, session_id),
            &(),
        )
        .await
}

/// List messages in an OpenCode session
#[tauri::command]
pub async fn sandbox_opencode_list_messages(sandbox_id: String, session_id: String) -> Result<Vec<Message>, AppError> {
    let client = get_client()?;
    client
        .get(&format!("/api/v2/sandboxes/{}/opencode/session/{}/message", sandbox_id, session_id))
        .await
}

/// Send a message to an OpenCode session
#[tauri::command]
pub async fn sandbox_opencode_send_message(
    sandbox_id: String,
    session_id: String,
    input: SendMessageInput,
) -> Result<Message, AppError> {
    let client = get_client()?;
    client
        .post(
            &format!("/api/v2/sandboxes/{}/opencode/session/{}/message", sandbox_id, session_id),
            &input,
        )
        .await
}

/// Get a specific message from an OpenCode session
#[tauri::command]
pub async fn sandbox_opencode_get_message(
    sandbox_id: String,
    session_id: String,
    message_id: String,
) -> Result<Message, AppError> {
    let client = get_client()?;
    client
        .get(&format!(
            "/api/v2/sandboxes/{}/opencode/session/{}/message/{}",
            sandbox_id, session_id, message_id
        ))
        .await
}

/// List files in a sandbox directory via OpenCode
#[tauri::command]
pub async fn sandbox_opencode_list_files(sandbox_id: String, path: String) -> Result<Vec<FileNode>, AppError> {
    let client = get_client()?;
    client
        .get(&format!(
            "/api/v2/sandboxes/{}/opencode/file?path={}",
            sandbox_id,
            urlencoding::encode(&path)
        ))
        .await
}

/// Get file content via OpenCode
#[tauri::command]
pub async fn sandbox_opencode_get_file_content(sandbox_id: String, path: String) -> Result<FileContent, AppError> {
    let client = get_client()?;
    client
        .get(&format!(
            "/api/v2/sandboxes/{}/opencode/file/content?path={}",
            sandbox_id,
            urlencoding::encode(&path)
        ))
        .await
}

/// Find files by query via OpenCode
#[tauri::command]
pub async fn sandbox_opencode_find_files(sandbox_id: String, query: String) -> Result<Vec<String>, AppError> {
    let client = get_client()?;
    client
        .get(&format!(
            "/api/v2/sandboxes/{}/opencode/find/file?query={}",
            sandbox_id,
            urlencoding::encode(&query)
        ))
        .await
}

// =============================================================================
// Preview Ports (Web Preview)
// =============================================================================

use crate::models::{
    DetectPortsResponse, PreviewPort, PreviewPortsResponse, RegisterPreviewPortInput,
    SharePreviewPortInput, SharePreviewPortResponse,
};

#[tauri::command]
pub async fn get_sandbox_preview_ports(sandbox_id: String) -> Result<Vec<PreviewPort>, AppError> {
    let client = get_client()?;
    let response: PreviewPortsResponse = client
        .get(&format!("/api/v2/sandboxes/{}/preview", sandbox_id))
        .await?;
    Ok(response.ports)
}

#[tauri::command]
pub async fn detect_sandbox_preview_ports(sandbox_id: String) -> Result<DetectPortsResponse, AppError> {
    let client = get_client()?;
    client
        .post(&format!("/api/v2/sandboxes/{}/preview/detect", sandbox_id), &())
        .await
}

#[tauri::command]
pub async fn register_sandbox_preview_port(
    sandbox_id: String,
    port: i32,
    label: Option<String>,
) -> Result<PreviewPort, AppError> {
    let client = get_client()?;
    let input = RegisterPreviewPortInput { port, label };
    client
        .post(&format!("/api/v2/sandboxes/{}/preview", sandbox_id), &input)
        .await
}

#[tauri::command]
pub async fn delete_sandbox_preview_port(sandbox_id: String, port: i32) -> Result<(), AppError> {
    let client = get_client()?;
    let _: SuccessResponse = client
        .delete(&format!("/api/v2/sandboxes/{}/preview/{}", sandbox_id, port))
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn share_sandbox_preview_port(
    sandbox_id: String,
    port: i32,
    expires_in: Option<String>,
) -> Result<SharePreviewPortResponse, AppError> {
    let client = get_client()?;
    let input = SharePreviewPortInput { expires_in };
    client
        .post(&format!("/api/v2/sandboxes/{}/preview/{}/share", sandbox_id, port), &input)
        .await
}

#[tauri::command]
pub async fn unshare_sandbox_preview_port(sandbox_id: String, port: i32) -> Result<(), AppError> {
    let client = get_client()?;
    let _: SuccessResponse = client
        .delete(&format!("/api/v2/sandboxes/{}/preview/{}/share", sandbox_id, port))
        .await?;
    Ok(())
}

// =============================================================================
// SSE Event Streaming
// =============================================================================

use crate::models::{
    OpenCodeEvent, StreamConnection, StreamEventPayload, StreamStatus, StreamStatusPayload,
};
use futures::StreamExt;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

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

/// Connect to OpenCode SSE event stream for a sandbox
/// 
/// This starts a background task that:
/// 1. Connects to the Management API's SSE endpoint
/// 2. Emits "opencode:event" events to the frontend for each SSE message
/// 3. Emits "opencode:stream-status" events for connection status changes
/// 
/// Returns a StreamConnection with a unique stream_id that can be used to disconnect.
#[tauri::command]
pub async fn sandbox_opencode_connect_stream(
    app: AppHandle,
    sandbox_id: String,
) -> Result<StreamConnection, AppError> {
    let client = get_client()?;
    let stream_id = uuid::Uuid::new_v4().to_string();
    let stream_id_clone = stream_id.clone();
    let sandbox_id_clone = sandbox_id.clone();
    
    // Create abort channel
    let (abort_tx, mut abort_rx) = tokio::sync::oneshot::channel::<()>();
    
    // Store the abort handle
    let handles = get_stream_handles(&app);
    {
        let mut handles_guard = handles.lock().await;
        handles_guard.insert(stream_id.clone(), abort_tx);
    }
    
    // Get the SSE stream response
    let response = client
        .sse_get(&format!("/api/v2/sandboxes/{}/opencode/event", sandbox_id))
        .await?;
    
    // Spawn background task to process the stream
    let app_clone = app.clone();
    let handles_clone = handles.clone();
    
    tokio::spawn(async move {
        let stream_id = stream_id_clone;
        let sandbox_id = sandbox_id_clone;
        
        // Emit connected status
        let _ = app_clone.emit(
            "opencode:stream-status",
            StreamStatusPayload {
                stream_id: stream_id.clone(),
                project_id: sandbox_id.clone(),
                status: StreamStatus::Connected,
                error: None,
            },
        );
        
        // Process the stream
        let mut bytes_stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut chunk_count = 0u64;
        let mut event_count = 0u64;
        
        tracing::info!("Starting SSE stream processing for sandbox {}", sandbox_id);
        
        loop {
            tokio::select! {
                // Check for abort signal
                _ = &mut abort_rx => {
                    tracing::info!("SSE stream aborted for sandbox {}", sandbox_id);
                    break;
                }
                
                // Process stream data
                chunk = bytes_stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            chunk_count += 1;
                            let text = String::from_utf8_lossy(&bytes);
                            tracing::info!(
                                "SSE chunk #{} for {}: {} bytes, raw={:?}",
                                chunk_count,
                                sandbox_id,
                                bytes.len(),
                                if text.len() > 500 { format!("{}...", &text[..500]) } else { text.to_string() }
                            );
                            buffer.push_str(&text);
                            
                            // Process complete SSE events from buffer
                            while let Some(event) = parse_sse_event(&mut buffer) {
                                event_count += 1;
                                tracing::info!("Emitting SSE event #{}: type={}", event_count, event.event_type);
                                let emit_result = app_clone.emit(
                                    "opencode:event",
                                    StreamEventPayload {
                                        stream_id: stream_id.clone(),
                                        project_id: sandbox_id.clone(),
                                        event,
                                    },
                                );
                                if let Err(e) = emit_result {
                                    tracing::error!("Failed to emit SSE event: {}", e);
                                }
                            }
                        }
                        Some(Err(e)) => {
                            tracing::error!(
                                "SSE stream error for sandbox {}: error={:?}, \
                                 chunks_received={}, events_emitted={}, \
                                 buffer_len={}, buffer_preview={:?}",
                                sandbox_id,
                                e,
                                chunk_count,
                                event_count,
                                buffer.len(),
                                if buffer.len() > 500 { 
                                    format!("{}...", &buffer[..500]) 
                                } else { 
                                    buffer.clone() 
                                }
                            );
                            // Emit error status
                            let _ = app_clone.emit(
                                "opencode:stream-status",
                                StreamStatusPayload {
                                    stream_id: stream_id.clone(),
                                    project_id: sandbox_id.clone(),
                                    status: StreamStatus::Error,
                                    error: Some(e.to_string()),
                                },
                            );
                            break;
                        }
                        None => {
                            tracing::info!("SSE stream ended for sandbox {} (chunks={}, events={})", 
                                sandbox_id, chunk_count, event_count);
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
                project_id: sandbox_id.clone(),
                status: StreamStatus::Disconnected,
                error: None,
            },
        );
    });
    
    Ok(StreamConnection {
        stream_id,
        project_id: sandbox_id,
    })
}

/// Disconnect from an OpenCode SSE event stream
#[tauri::command]
pub async fn sandbox_opencode_disconnect_stream(
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
