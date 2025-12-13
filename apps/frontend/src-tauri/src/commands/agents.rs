//! AI Assistant (Agent) management commands
//!
//! Commands for managing AI Assistants (agent harnesses) such as OpenCode,
//! Claude Code, Gemini CLI, and Codex. These commands proxy to the Management
//! API which in turn communicates with the ACP Gateway.

use crate::models::{
    AgentAuthCompleteResponse, AgentAuthInitResponse, AgentAuthStatusResponse,
    AgentInstance, AgentListResponse, AgentModesResponse, AgentSpawnResponse, AppError,
};
use crate::services::ApiClient;
use std::collections::HashMap;

/// Helper to get an authenticated API client
fn get_client() -> Result<ApiClient, AppError> {
    ApiClient::new()
}

// =============================================================================
// Agent Listing
// =============================================================================

/// List all available AI Assistants
#[tauri::command]
pub async fn list_agents() -> Result<AgentListResponse, AppError> {
    let client = get_client()?;
    client.get("/api/agents").await
}

/// Get a specific AI Assistant by ID
#[tauri::command]
pub async fn get_agent(agent_id: String) -> Result<AgentInstance, AppError> {
    let client = get_client()?;
    client.get(&format!("/api/agents/{}", agent_id)).await
}

/// Get available modes for an AI Assistant
#[tauri::command]
pub async fn get_agent_modes(agent_id: String) -> Result<AgentModesResponse, AppError> {
    let client = get_client()?;
    client
        .get(&format!("/api/agents/{}/modes", agent_id))
        .await
}

// =============================================================================
// Agent Lifecycle
// =============================================================================

/// Spawn (start) an AI Assistant
#[tauri::command]
pub async fn spawn_agent(
    agent_id: String,
    env: Option<HashMap<String, String>>,
    working_directory: Option<String>,
) -> Result<AgentSpawnResponse, AppError> {
    let client = get_client()?;
    let body = serde_json::json!({
        "env": env,
        "workingDirectory": working_directory,
    });
    client
        .post(&format!("/api/agents/{}/spawn", agent_id), &body)
        .await
}

/// Stop an AI Assistant
#[tauri::command]
pub async fn stop_agent(agent_id: String) -> Result<(), AppError> {
    let client = get_client()?;
    let _: crate::models::SuccessResponse = client
        .post(&format!("/api/agents/{}/stop", agent_id), &())
        .await?;
    Ok(())
}

// =============================================================================
// Authentication
// =============================================================================

/// Initialize authentication flow for an AI Assistant
/// 
/// Returns authentication instructions based on the flow type:
/// - url_first (Claude Code): Opens a URL, user brings back a code
/// - code_first (GitHub Copilot): Shows a code, user enters it on a URL
/// - api_key: Prompts for an API key
#[tauri::command]
pub async fn init_agent_auth(agent_id: String) -> Result<AgentAuthInitResponse, AppError> {
    let client = get_client()?;
    client
        .post(&format!("/api/agents/{}/auth", agent_id), &())
        .await
}

/// Complete authentication for an AI Assistant
///
/// For url_first flow: Pass the code from the browser
/// For api_key flow: Pass the API key as token
/// For code_first flow: Usually completes automatically via polling
#[tauri::command]
pub async fn complete_agent_auth(
    agent_id: String,
    code: Option<String>,
    token: Option<String>,
) -> Result<AgentAuthCompleteResponse, AppError> {
    let client = get_client()?;
    let body = serde_json::json!({
        "code": code,
        "token": token,
    });
    client
        .post(&format!("/api/agents/{}/auth/complete", agent_id), &body)
        .await
}

/// Get authentication status for an AI Assistant
#[tauri::command]
pub async fn get_agent_auth_status(agent_id: String) -> Result<AgentAuthStatusResponse, AppError> {
    let client = get_client()?;
    client
        .get(&format!("/api/agents/{}/auth/status", agent_id))
        .await
}

// =============================================================================
// Custom Agents
// =============================================================================

/// Add a custom AI Assistant
#[tauri::command]
pub async fn add_custom_agent(
    id: String,
    name: String,
    command: String,
    description: Option<String>,
    args: Option<Vec<String>>,
    requires_auth: Option<bool>,
    auth_type: Option<String>,
    auth_flow_type: Option<String>,
    auth_provider: Option<String>,
    auth_url: Option<String>,
    env_vars: Option<HashMap<String, String>>,
) -> Result<AgentInstance, AppError> {
    let client = get_client()?;
    let body = serde_json::json!({
        "id": id,
        "name": name,
        "command": command,
        "description": description,
        "args": args,
        "requiresAuth": requires_auth,
        "authType": auth_type,
        "authFlowType": auth_flow_type,
        "authProvider": auth_provider,
        "authUrl": auth_url,
        "envVars": env_vars,
    });
    client.post("/api/agents/custom", &body).await
}

/// Remove an AI Assistant (only works for custom agents)
#[tauri::command]
pub async fn remove_agent(agent_id: String) -> Result<(), AppError> {
    let client = get_client()?;
    let _: crate::models::SuccessResponse = client
        .delete(&format!("/api/agents/{}", agent_id))
        .await?;
    Ok(())
}

// =============================================================================
// Default Agent
// =============================================================================

/// Set the default AI Assistant for new sessions
#[tauri::command]
pub async fn set_default_agent(agent_id: String) -> Result<(), AppError> {
    let client = get_client()?;
    let body = serde_json::json!({
        "agentId": agent_id,
    });
    let _: crate::models::SuccessResponse = client.post("/api/agents/default", &body).await?;
    Ok(())
}

/// Get the default AI Assistant ID
#[tauri::command]
pub async fn get_default_agent() -> Result<String, AppError> {
    let client = get_client()?;
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        default_assistant_id: String,
    }
    let response: Response = client.get("/api/agents/default").await?;
    Ok(response.default_assistant_id)
}
