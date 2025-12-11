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
    
    // Container URLs
    pub fqdn_url: Option<String>,      // OpenCode API URL
    pub vnc_url: Option<String>,        // VNC/Desktop URL (desktop tier only)
    pub code_server_url: Option<String>, // Code Server URL (VS Code in browser)

    // GitHub sync
    pub github_repo_url: Option<String>,
    pub github_sync_enabled: bool,
    pub github_sync_direction: SyncDirection,
    pub last_sync_at: Option<String>,

    // LLM
    pub llm_provider: Option<String>,
    pub llm_model: Option<String>,

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub llm_model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container_tier_id: Option<String>,
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

// =============================================================================
// Container Tiers
// =============================================================================

/// Container tier resources
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierResources {
    pub cpu: String,
    pub memory: String,
    pub storage: String,
}

/// Container tier features
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierFeatures {
    pub has_desktop_access: bool,
    pub exposed_ports: Vec<String>,
}

/// Container tier
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerTier {
    pub id: String,
    pub name: String,
    pub description: String,
    pub image_type: String,
    pub resources: TierResources,
    pub features: TierFeatures,
    pub is_default: bool,
    pub sort_order: i32,
}

/// Container tiers list response from API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerTiersResponse {
    pub tiers: Vec<ContainerTier>,
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
