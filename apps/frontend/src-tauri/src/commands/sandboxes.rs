//! Sandbox management commands (v2 API)
//!
//! Commands for CRUD operations and container control for sandboxes.
//! These use the new direct Docker orchestration API instead of Coolify.

use crate::models::{
    AppError, CreateSandboxInput, DockerHealthResponse, ExecCommandInput, ExecResult,
    GitCommitInput, GitCommitResponse, GitLogResponse, GitStatusResponse, Sandbox,
    SandboxInfo, SandboxLogsResponse, SandboxStats, SandboxStatsResponse, SandboxWithRepo,
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
