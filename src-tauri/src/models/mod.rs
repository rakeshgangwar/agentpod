//! Data models for the CodeOpen Tauri app
//! These models mirror the Management API types

pub mod error;
pub mod opencode;
pub mod settings;

pub use error::AppError;
pub use opencode::*;
pub use settings::*;
use serde::{Deserialize, Serialize};

/// Project status enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Creating,
    Running,
    Stopped,
    Error,
}

/// GitHub sync direction
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SyncDirection {
    Push,
    Pull,
    Bidirectional,
}

/// Project model from Management API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,

    // Forgejo
    pub forgejo_repo_url: String,
    pub forgejo_repo_id: Option<i64>,
    pub forgejo_owner: String,

    // Coolify
    pub coolify_app_uuid: String,
    pub coolify_server_uuid: String,
    pub container_port: i32,

    // GitHub sync
    pub github_repo_url: Option<String>,
    pub github_sync_enabled: bool,
    pub github_sync_direction: SyncDirection,
    pub last_sync_at: Option<String>,

    // LLM
    pub llm_provider: Option<String>,

    // Status
    pub status: ProjectStatus,
    pub error_message: Option<String>,

    // Timestamps
    pub created_at: String,
    pub updated_at: String,
}

/// Input for creating a new project
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub github_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub llm_provider_id: Option<String>,
}

/// Connection configuration stored securely
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub api_url: String,
    pub api_key: Option<String>,
}

/// Connection status returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub connected: bool,
    pub api_url: Option<String>,
    pub last_tested: Option<String>,
    pub error: Option<String>,
}

/// Health check response from API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: String,
}

/// Projects list response from API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectsResponse {
    pub projects: Vec<Project>,
}

/// Single project response from API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectResponse {
    pub project: Project,
}

/// Generic success response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuccessResponse {
    pub success: bool,
    pub message: String,
}

/// Error response from API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub details: Option<String>,
}

/// Deploy response from API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployResponse {
    pub success: bool,
    pub message: String,
    pub deployment_id: Option<String>,
}
