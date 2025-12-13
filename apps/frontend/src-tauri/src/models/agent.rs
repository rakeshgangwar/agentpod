//! Agent (AI Assistant) types for the CodeOpen Tauri app
//!
//! These models mirror the TypeScript types in packages/types/src/agent.ts

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// =============================================================================
// Core Types
// =============================================================================

/// Status of an AI Assistant process
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Stopped,
    Starting,
    Running,
    Error,
    AuthRequired,
}

/// Authentication type required by an assistant
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentAuthType {
    None,
    Oauth,
    DeviceFlow,
    ApiKey,
    PkceOauth,
}

/// Device flow authentication pattern
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentAuthFlowType {
    CodeFirst,
    UrlFirst,
    PkceOauth,
}

/// Source of an Agent Mode definition
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentModeSource {
    Builtin,
    Custom,
}

/// Status of an authentication flow
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentAuthStatus {
    Idle,
    Pending,
    Completed,
    Failed,
}

// =============================================================================
// Configuration Types
// =============================================================================

/// Configuration for an AI Assistant
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    /// Unique identifier
    pub id: String,
    /// Display name
    pub name: String,
    /// Description of the assistant's capabilities
    pub description: String,
    /// Command to execute (e.g., "opencode", "claude-code-acp")
    pub command: String,
    /// Command-line arguments
    pub args: Vec<String>,
    /// Whether authentication is required
    pub requires_auth: bool,
    /// Type of authentication required
    pub auth_type: AgentAuthType,
    /// Device flow pattern (for device_flow auth type)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_flow_type: Option<AgentAuthFlowType>,
    /// Provider name for authentication (e.g., "anthropic", "google", "openai")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_provider: Option<String>,
    /// URL for authentication or API key retrieval
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_url: Option<String>,
    /// Environment variables to set when spawning
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_vars: Option<HashMap<String, String>>,
    /// Whether this is a built-in (pre-installed) assistant
    pub is_built_in: bool,
    /// Whether this is the default assistant for new sessions
    pub is_default: bool,
    /// Optional icon URL or emoji
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

/// Runtime instance of an AI Assistant
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInstance {
    /// Unique identifier
    pub id: String,
    /// Configuration
    pub config: AgentConfig,
    /// Current process status
    pub status: AgentStatus,
    /// Whether the user is authenticated with this assistant's provider
    pub authenticated: bool,
    /// When the process was started
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    /// Last activity timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_activity: Option<String>,
    /// Error message if status is "error"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Number of active sessions
    pub session_count: u32,
}

// =============================================================================
// Agent Mode Types
// =============================================================================

/// Agent Mode (persona/behavior) definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMode {
    /// Unique identifier
    pub id: String,
    /// Display name
    pub name: String,
    /// Description of this mode's behavior
    pub description: String,
    /// Source of the mode definition
    pub source: AgentModeSource,
    /// Which AI Assistant this mode belongs to ("all" for universal)
    pub assistant_id: String,
    /// System prompt/instructions for custom modes
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    /// For OpenCode: maps to the agent ID from /agent endpoint
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opencode_agent_id: Option<String>,
    /// Optional icon
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

// =============================================================================
// Authentication Types
// =============================================================================

/// State of an ongoing authentication flow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAuthState {
    /// Agent ID this auth is for
    pub agent_id: String,
    /// Current status
    pub status: AgentAuthStatus,
    /// Flow type being used
    pub flow_type: String, // "code_first", "url_first", or "api_key"
    /// For code_first flow: the code to display to user
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_code: Option<String>,
    /// For code_first flow: URL where user enters the code
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_url: Option<String>,
    /// For url_first flow: URL to open in browser
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_url: Option<String>,
    /// When this auth flow expires
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    /// Error message if status is "failed"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/// Response from listing all agents
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentListResponse {
    /// All available AI Assistants
    pub assistants: Vec<AgentInstance>,
    /// ID of the default assistant
    pub default_assistant_id: String,
}

/// Response from listing agent modes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModesResponse {
    /// Available modes for the agent
    pub modes: Vec<AgentMode>,
    /// ID of the default mode (if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_mode_id: Option<String>,
}

/// Response from initiating authentication
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAuthInitResponse {
    /// Flow type to use
    pub flow_type: String, // "code_first", "url_first", "api_key", or "pkce_oauth"
    /// For code_first: code to display
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_code: Option<String>,
    /// For code_first: URL for verification
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_url: Option<String>,
    /// For url_first/pkce_oauth: URL to open
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_url: Option<String>,
    /// Seconds until expiration
    pub expires_in: u32,
    /// Human-readable message
    pub message: String,
    /// For pkce_oauth: state ID to track the OAuth flow
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_id: Option<String>,
    /// For pkce_oauth: auth mode ('max' or 'console')
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_mode: Option<String>,
}

/// Request to complete authentication
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAuthCompleteRequest {
    /// For url_first flow: code from browser
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    /// For api_key flow: the API key
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

/// Response after completing authentication
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAuthCompleteResponse {
    /// Whether authentication succeeded
    pub success: bool,
    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Request to spawn an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSpawnRequest {
    /// Environment variables to set
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    /// Working directory override
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<String>,
}

/// Response from spawning an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSpawnResponse {
    /// Agent ID
    pub id: String,
    /// New status
    pub status: AgentStatus,
    /// When started
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
}

/// Request to add a custom agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCustomAddRequest {
    /// Unique ID (must not conflict with built-in)
    pub id: String,
    /// Display name
    pub name: String,
    /// Description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Command to execute
    pub command: String,
    /// Arguments
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    /// Whether auth is required
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_auth: Option<bool>,
    /// Auth type if required
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_type: Option<AgentAuthType>,
    /// Auth flow type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_flow_type: Option<AgentAuthFlowType>,
    /// Auth provider name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_provider: Option<String>,
    /// URL for auth
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_url: Option<String>,
    /// Environment variables
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_vars: Option<HashMap<String, String>>,
}

/// Request to set the default agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSetDefaultRequest {
    /// Agent ID to set as default
    pub agent_id: String,
}

/// Get agent auth status response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAuthStatusResponse {
    /// Whether authenticated
    pub authenticated: bool,
    /// When the auth expires (if known)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
}
