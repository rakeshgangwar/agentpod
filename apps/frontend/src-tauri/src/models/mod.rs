//! Data models for the CodeOpen Tauri app
//! These models mirror the Management API types

pub mod error;
pub mod opencode;
pub mod settings;

pub use error::AppError;
pub use opencode::*;
pub use settings::*;
use serde::{Deserialize, Serialize};

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

// =============================================================================
// Resource Tiers (Modular Container System)
// =============================================================================

/// Resource tier resources
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceTierResources {
    pub cpu_cores: f64,
    pub memory_gb: f64,
    pub storage_gb: f64,
}

/// Resource tier (CPU, memory, storage)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceTier {
    pub id: String,
    pub name: String,
    pub description: String,
    pub resources: ResourceTierResources,
    pub price_monthly: f64,
    pub is_default: bool,
    pub sort_order: i32,
}

/// Resource tiers list response from API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceTiersResponse {
    pub tiers: Vec<ResourceTier>,
}

// =============================================================================
// Container Flavors (Language/Framework)
// =============================================================================

/// Container flavor (language/framework)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerFlavor {
    pub id: String,
    pub name: String,
    pub description: String,
    pub languages: Vec<String>,
    pub image_size_mb: i32,
    pub is_default: bool,
    pub sort_order: i32,
}

/// Container flavors list response from API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerFlavorsResponse {
    pub flavors: Vec<ContainerFlavor>,
}

// =============================================================================
// Container Addons
// =============================================================================

/// Container addon
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerAddon {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub image_size_mb: i32,
    pub port: Option<i32>,
    pub requires_gpu: bool,
    pub requires_flavor: Option<String>,
    pub price_monthly: f64,
    pub sort_order: i32,
}

/// Container addons list response from API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerAddonsResponse {
    pub addons: Vec<ContainerAddon>,
}

// =============================================================================
// V2 Sandbox Types (Direct Docker Orchestration)
// =============================================================================

/// Sandbox status enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SandboxStatus {
    Created,
    Running,
    Paused,
    Restarting,
    Exited,
    Dead,
    Unknown,
}

/// Sandbox URLs for accessing services
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SandboxUrls {
    pub homepage: Option<String>,
    pub opencode: Option<String>,
    #[serde(default)]
    pub code_server: Option<String>,
    #[serde(default)]
    pub vnc: Option<String>,
}

/// Health status from Docker container
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxHealth {
    pub status: String,
    #[serde(default)]
    pub failing_streak: u32,
    #[serde(default)]
    pub last_check: Option<String>,
}

/// Sandbox model from v2 API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sandbox {
    pub id: String,
    pub container_id: String,
    pub name: String,
    pub status: SandboxStatus,
    pub urls: SandboxUrls,
    pub created_at: String,
    #[serde(default)]
    pub started_at: Option<String>,
    pub image: String,
    #[serde(default)]
    pub labels: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub health: Option<SandboxHealth>,
}

/// Repository model from v2 API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub last_modified: String,
    pub current_branch: String,
    pub is_dirty: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Input for creating a new sandbox
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSandboxInput {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub github_url: Option<String>,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flavor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_tier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub addons: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_start: Option<bool>,
}

/// Sandbox with repository response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxWithRepo {
    pub sandbox: Sandbox,
    pub repository: Repository,
}

/// Sandbox info response (includes config)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxInfo {
    pub sandbox: Sandbox,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repository: Option<Repository>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<serde_json::Value>,
}

/// Sandbox list response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxListResponse {
    pub sandboxes: Vec<Sandbox>,
    pub count: usize,
}

/// Sandbox resource stats
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxStats {
    pub cpu_percent: f64,
    pub memory_usage: u64,
    pub memory_limit: u64,
    pub memory_percent: f64,
    pub network_rx: u64,
    pub network_tx: u64,
    pub block_read: u64,
    pub block_write: u64,
}

/// Sandbox stats response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxStatsResponse {
    pub stats: SandboxStats,
}

/// Sandbox logs response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxLogsResponse {
    pub logs: String,
    pub tail: u32,
}

/// Exec command input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecCommandInput {
    pub command: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
}

/// Exec result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Git file status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub staged: String,
    pub unstaged: String,
    pub tracked: bool,
}

/// Git status response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResponse {
    pub files: Vec<GitFileStatus>,
}

/// Git commit author
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitAuthor {
    pub name: String,
    pub email: String,
    pub timestamp: String,
}

/// Git commit
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub sha: String,
    pub message: String,
    pub author: GitAuthor,
    pub committer: GitAuthor,
    pub parents: Vec<String>,
    pub timestamp: String,
}

/// Git log response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogResponse {
    pub commits: Vec<GitCommit>,
}

/// Git commit input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitInput {
    pub message: String,
}

/// Git commit response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitResponse {
    pub sha: String,
    pub message: String,
}

/// Docker health response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerHealthResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub docker: Option<DockerInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Docker info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerInfo {
    pub version: String,
    pub api_version: String,
    pub os: String,
    pub arch: String,
    pub containers: DockerContainerStats,
    pub images: u32,
}

/// Docker container stats
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainerStats {
    pub running: u32,
    pub stopped: u32,
}

// =============================================================================
// OpenCode Types
// =============================================================================

/// OpenCode model info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeModel {
    pub id: String,
    pub name: String,
}

/// OpenCode provider with models
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeProvider {
    pub id: String,
    pub name: String,
    pub models: Vec<OpenCodeModel>,
}
