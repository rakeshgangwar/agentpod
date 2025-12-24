//! Sandbox management commands (v2 API)
//!
//! Commands for CRUD operations and container control for sandboxes.
//! These use the new direct Docker orchestration API instead of Coolify.

use crate::models::{
    AppError, CreateSandboxInput, DockerHealthResponse, ExecCommandInput, ExecResult,
    GitCommitInput, GitCommitResponse, GitLogResponse, GitStatusResponse, Sandbox, SandboxInfo,
    SandboxLogsResponse, SandboxStats, SandboxStatsResponse, SandboxWithRepo, SuccessResponse,
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
    agent_slugs: Option<Vec<String>>,
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
        agent_slugs,
    };

    client.post("/api/v2/sandboxes", &input).await
}

/// Delete a sandbox
#[tauri::command]
pub async fn delete_sandbox(id: String) -> Result<(), AppError> {
    let client = get_client()?;
    let _: crate::models::SuccessResponse =
        client.delete(&format!("/api/v2/sandboxes/{}", id)).await?;
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

/// Wake a sleeping Cloudflare sandbox
#[tauri::command]
pub async fn wake_sandbox(id: String) -> Result<Sandbox, AppError> {
    let client = get_client()?;
    #[derive(serde::Deserialize)]
    struct Response {
        sandbox: Sandbox,
    }
    let response: Response = client
        .post(&format!("/api/v2/sandboxes/{}/wake", id), &())
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
pub async fn commit_sandbox_changes(
    id: String,
    message: String,
) -> Result<GitCommitResponse, AppError> {
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
    GitBranchesResponse, GitCheckoutInput, GitCreateBranchInput, GitDiffResponse,
    GitFileDiffResponse,
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
        .delete(&format!(
            "/api/v2/sandboxes/{}/git/branches/{}",
            id, encoded_branch
        ))
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
pub async fn get_sandbox_file_diff(
    id: String,
    file_path: String,
) -> Result<GitFileDiffResponse, AppError> {
    let client = get_client()?;
    let encoded_path = urlencoding::encode(&file_path);
    client
        .get(&format!(
            "/api/v2/sandboxes/{}/git/diff/file?path={}",
            id, encoded_path
        ))
        .await
}

// =============================================================================
// OpenCode Integration (v2 Sandbox)
// =============================================================================

use crate::models::{
    AppInfo, FileContent, FileNode, Message, OpenCodeHealth, SendMessageInput, Session,
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
pub async fn sandbox_opencode_get_providers(
    sandbox_id: String,
) -> Result<Vec<crate::models::OpenCodeProvider>, AppError> {
    let client = get_client()?;

    #[derive(serde::Deserialize)]
    struct Response {
        providers: Vec<crate::models::OpenCodeProvider>,
    }

    let response: Response = client
        .get(&format!(
            "/api/v2/sandboxes/{}/opencode/providers",
            sandbox_id
        ))
        .await?;
    Ok(response.providers)
}

/// Get available agents for a sandbox
#[tauri::command]
pub async fn sandbox_opencode_get_agents(
    sandbox_id: String,
) -> Result<Vec<crate::models::OpenCodeAgent>, AppError> {
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
        .get(&format!(
            "/api/v2/sandboxes/{}/opencode/session",
            sandbox_id
        ))
        .await
}

/// Create a new OpenCode session in a sandbox
#[tauri::command]
pub async fn sandbox_opencode_create_session(
    sandbox_id: String,
    title: Option<String>,
) -> Result<Session, AppError> {
    let client = get_client()?;
    // Only include title if it's Some, otherwise send empty object
    let body = match title {
        Some(t) => serde_json::json!({ "title": t }),
        None => serde_json::json!({}),
    };
    client
        .post(
            &format!("/api/v2/sandboxes/{}/opencode/session", sandbox_id),
            &body,
        )
        .await
}

/// Get an OpenCode session by ID
#[tauri::command]
pub async fn sandbox_opencode_get_session(
    sandbox_id: String,
    session_id: String,
) -> Result<Session, AppError> {
    let client = get_client()?;
    client
        .get(&format!(
            "/api/v2/sandboxes/{}/opencode/session/{}",
            sandbox_id, session_id
        ))
        .await
}

/// Delete an OpenCode session
#[tauri::command]
pub async fn sandbox_opencode_delete_session(
    sandbox_id: String,
    session_id: String,
) -> Result<(), AppError> {
    let client = get_client()?;
    let _: crate::models::SuccessResponse = client
        .delete(&format!(
            "/api/v2/sandboxes/{}/opencode/session/{}",
            sandbox_id, session_id
        ))
        .await?;
    Ok(())
}

/// Abort a running OpenCode session
#[tauri::command]
pub async fn sandbox_opencode_abort_session(
    sandbox_id: String,
    session_id: String,
) -> Result<(), AppError> {
    let client = get_client()?;
    let _: crate::models::SuccessResponse = client
        .post(
            &format!(
                "/api/v2/sandboxes/{}/opencode/session/{}/abort",
                sandbox_id, session_id
            ),
            &(),
        )
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
            &format!(
                "/api/v2/sandboxes/{}/opencode/session/{}/permissions/{}",
                sandbox_id, session_id, permission_id
            ),
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
pub async fn get_all_pending_permissions() -> Result<Vec<crate::models::PendingPermission>, AppError>
{
    let client = get_client()?;

    #[derive(serde::Deserialize)]
    struct Response {
        permissions: Vec<crate::models::PendingPermission>,
    }

    let response: Response = client.get("/api/v2/pending-actions/permissions").await?;
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
            &format!(
                "/api/v2/sandboxes/{}/opencode/session/{}/fork",
                sandbox_id, session_id
            ),
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
            &format!(
                "/api/v2/sandboxes/{}/opencode/session/{}/revert",
                sandbox_id, session_id
            ),
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
            &format!(
                "/api/v2/sandboxes/{}/opencode/session/{}/unrevert",
                sandbox_id, session_id
            ),
            &(),
        )
        .await
}

/// List messages in an OpenCode session
#[tauri::command]
pub async fn sandbox_opencode_list_messages(
    sandbox_id: String,
    session_id: String,
) -> Result<Vec<Message>, AppError> {
    let client = get_client()?;
    client
        .get(&format!(
            "/api/v2/sandboxes/{}/opencode/session/{}/message",
            sandbox_id, session_id
        ))
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
            &format!(
                "/api/v2/sandboxes/{}/opencode/session/{}/message",
                sandbox_id, session_id
            ),
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
pub async fn sandbox_opencode_list_files(
    sandbox_id: String,
    path: String,
) -> Result<Vec<FileNode>, AppError> {
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
pub async fn sandbox_opencode_get_file_content(
    sandbox_id: String,
    path: String,
) -> Result<FileContent, AppError> {
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
pub async fn sandbox_opencode_find_files(
    sandbox_id: String,
    query: String,
) -> Result<Vec<String>, AppError> {
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
pub async fn detect_sandbox_preview_ports(
    sandbox_id: String,
) -> Result<DetectPortsResponse, AppError> {
    let client = get_client()?;
    client
        .post(
            &format!("/api/v2/sandboxes/{}/preview/detect", sandbox_id),
            &(),
        )
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
        .delete(&format!(
            "/api/v2/sandboxes/{}/preview/{}",
            sandbox_id, port
        ))
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
        .post(
            &format!("/api/v2/sandboxes/{}/preview/{}/share", sandbox_id, port),
            &input,
        )
        .await
}

#[tauri::command]
pub async fn unshare_sandbox_preview_port(sandbox_id: String, port: i32) -> Result<(), AppError> {
    let client = get_client()?;
    let _: SuccessResponse = client
        .delete(&format!(
            "/api/v2/sandboxes/{}/preview/{}/share",
            sandbox_id, port
        ))
        .await?;
    Ok(())
}
