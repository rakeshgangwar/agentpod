//! Data models for the AgentPod Tauri app
//! These models mirror the Management API types

pub mod error;
pub mod onboarding;
pub mod opencode;
pub mod settings;

pub use error::AppError;
pub use onboarding::*;
pub use opencode::*;
use serde::{Deserialize, Serialize};
pub use settings::*;

/// Connection configuration stored securely
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub api_url: String,
    pub api_key: Option<String>,
}

/// Connection status returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    #[serde(default)]
    pub message: Option<String>,
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
/// Must match the API's SandboxStatus: 'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'sleeping' | 'error'
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SandboxStatus {
    Created,
    Starting,
    Running,
    Stopping,
    Stopped,
    Sleeping,
    Error,
    #[serde(other)]
    Unknown,
}

/// Sandbox URLs for accessing services
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SandboxUrls {
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub opencode: Option<String>,
    #[serde(default)]
    pub code_server: Option<String>,
    #[serde(default)]
    pub vnc: Option<String>,
    #[serde(default)]
    pub acp_gateway: Option<String>,
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
    pub user_id: String,
    pub name: String,
    pub slug: String,
    #[serde(default)]
    pub description: Option<String>,

    // Provider (docker or cloudflare)
    #[serde(default)]
    pub provider: Option<String>,

    // Git/Repository info
    pub repo_name: String,
    #[serde(default)]
    pub github_url: Option<String>,

    // Container configuration
    #[serde(default)]
    pub resource_tier_id: Option<String>,
    #[serde(default)]
    pub flavor_id: Option<String>,
    #[serde(default)]
    pub addon_ids: Vec<String>,

    // Container runtime info
    #[serde(default)]
    pub container_id: Option<String>,
    #[serde(default)]
    pub container_name: Option<String>,
    pub status: SandboxStatus,
    #[serde(default)]
    pub error_message: Option<String>,

    // Individual URL fields from DB
    #[serde(default)]
    pub opencode_url: Option<String>,
    #[serde(default)]
    pub acp_gateway_url: Option<String>,
    #[serde(default)]
    pub vnc_url: Option<String>,
    #[serde(default)]
    pub code_server_url: Option<String>,

    // URLs object (for backward compatibility)
    #[serde(default)]
    pub urls: Option<SandboxUrls>,

    // Timestamps
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub last_accessed_at: Option<String>,

    // Additional Docker runtime info (enriched at runtime, may not always be present)
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub labels: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub health: Option<SandboxHealth>,
    #[serde(default)]
    pub started_at: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
}

/// Sandbox with repository response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxWithRepo {
    pub sandbox: Sandbox,
    pub repository: Option<Repository>,
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

// =============================================================================
// Git Branch and Diff Types
// =============================================================================

/// Git branch info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    #[serde(rename = "ref")]
    pub git_ref: String,
    pub sha: String,
    pub current: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ahead: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub behind: Option<u32>,
}

/// Git branches list response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchesResponse {
    pub branches: Vec<GitBranch>,
    pub current: String,
}

/// Git create branch input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCreateBranchInput {
    pub name: String,
    #[serde(rename = "ref", skip_serializing_if = "Option::is_none")]
    pub from_ref: Option<String>,
}

/// Git checkout input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCheckoutInput {
    pub branch: String,
}

/// Git diff summary (changed files)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffSummary {
    pub added: Vec<String>,
    pub modified: Vec<String>,
    pub deleted: Vec<String>,
    pub renamed: Vec<GitRenamedFile>,
}

/// Git renamed file info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRenamedFile {
    pub from: String,
    pub to: String,
}

/// Git diff summary response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResponse {
    pub diff: GitDiffSummary,
}

/// A single line in a diff hunk
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffLine {
    /// Type of change: "context", "addition", "deletion"
    #[serde(rename = "type")]
    pub line_type: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_line_number: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_line_number: Option<u32>,
}

/// A hunk represents a contiguous section of changes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<GitDiffLine>,
}

/// Git file diff with structured hunks
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileDiff {
    pub path: String,
    /// Status: "added", "modified", "deleted", "renamed"
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
    #[serde(default)]
    pub hunks: Vec<GitDiffHunk>,
}

/// Git file diff response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileDiffResponse {
    pub file_diff: GitFileDiff,
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
// Preview Port Types
// =============================================================================

/// Preview port for web preview feature
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewPort {
    pub id: String,
    pub sandbox_id: String,
    pub port: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub is_public: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected_framework: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected_process: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seen_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_url: Option<String>,
}

/// Response for listing preview ports
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewPortsResponse {
    pub ports: Vec<PreviewPort>,
    pub count: usize,
}

/// Response for detect and register ports operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectPortsResponse {
    pub ports: Vec<PreviewPort>,
    pub detected: usize,
}

/// Input for registering a preview port
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPreviewPortInput {
    pub port: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Input for creating a share link
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharePreviewPortInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_in: Option<String>,
}

/// Response for creating a share link
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharePreviewPortResponse {
    pub url: String,
    pub token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
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

/// OpenCode agent info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeAgent {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub mode: String, // "primary" | "subagent" | "all"
    pub built_in: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hidden: Option<bool>,
}
