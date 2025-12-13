//! Settings models for the CodeOpen app
//! 
//! Local settings are stored in ~/.config/codeopen/settings.json

use serde::{Deserialize, Serialize};

/// Theme preference
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
}

/// App settings stored locally
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// Theme preference (light, dark, system)
    pub theme: Theme,
    
    /// Default LLM provider ID (from Management API)
    pub default_provider_id: Option<String>,
    
    /// Auto-refresh interval in seconds (0 = disabled)
    pub auto_refresh_interval: u32,
    
    /// Whether in-app toast notifications are enabled
    #[serde(default = "default_true")]
    pub in_app_notifications: bool,
    
    /// Whether system/OS notifications are enabled
    #[serde(default = "default_true")]
    pub system_notifications: bool,
}

fn default_true() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            default_provider_id: None,
            auto_refresh_interval: 30,
            in_app_notifications: true,
            system_notifications: true,
        }
    }
}

/// LLM Provider info from Management API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: String,  // "api-key" or "oauth"
    pub is_configured: bool,
    pub is_default: bool,
}

/// Model capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapabilities {
    pub image: bool,
    pub video: bool,
    pub tools: bool,
    pub streaming: bool,
}

/// Model pricing info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPricing {
    pub input: f64,
    pub output: f64,
}

/// Model info from providers list
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub context: u32,
    pub max_output: u32,
    pub pricing: ModelPricing,
    pub capabilities: ModelCapabilities,
}

/// Enhanced provider with models from Models.dev
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderWithModels {
    pub id: String,
    pub name: String,
    pub auth_type: String,  // "api_key", "oauth", or "device_flow"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_env_var: Option<String>,
    pub is_configured: bool,
    pub is_default: bool,
    pub logo_url: String,
    pub models: Vec<ModelInfo>,
}

/// Providers list response from Management API (enhanced)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidersWithModelsResponse {
    pub providers: Vec<ProviderWithModels>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub popular_count: Option<usize>,
}

/// OAuth device flow initialization response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthFlowInit {
    pub state_id: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_at: String,
    pub interval: u32,
}

/// OAuth flow status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthFlowStatus {
    pub status: String,  // "pending", "completed", "expired", "error"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default)]
    pub is_configured: bool,
}

/// Providers list response from Management API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvidersResponse {
    pub providers: Vec<Provider>,
}

/// Single provider response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderResponse {
    pub provider: Provider,
}

/// Export data structure (settings + connection info)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportData {
    /// App version for compatibility checking
    pub version: String,
    
    /// Export timestamp
    pub exported_at: String,
    
    /// App settings
    pub settings: AppSettings,
    
    /// API URL (not the key for security)
    pub api_url: Option<String>,
}

// =============================================================================
// User OpenCode Config Types (from Management API)
// =============================================================================

/// Permission level for OpenCode tools
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum PermissionLevel {
    Allow,
    #[default]
    Ask,
    Deny,
}

/// User's OpenCode permission settings
/// Uses snake_case to match OpenCode's config format
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PermissionSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bash: Option<PermissionLevel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub write: Option<PermissionLevel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edit: Option<PermissionLevel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webfetch: Option<PermissionLevel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp: Option<PermissionLevel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doom_loop: Option<PermissionLevel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_directory: Option<PermissionLevel>,
}

/// User's OpenCode settings (Layer 3)
/// Uses snake_case to match OpenCode's config format
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserOpencodeSettings {
    /// Theme: "opencode", "gruvbox", "catppuccin", etc.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    
    /// Permission settings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission: Option<PermissionSettings>,
    
    /// Provider configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<serde_json::Value>,
}

/// User OpenCode config file (agents, commands, tools, plugins)
/// Note: When returned in full config, only type/name/extension/content are present
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserOpencodeFile {
    #[serde(default)]
    pub name: String,
    #[serde(rename = "type", default)]
    pub file_type: String,  // "agent", "command", "tool", "plugin"
    #[serde(default)]
    pub extension: String,  // "md" or "ts"
    #[serde(default)]
    pub content: String,
    // These fields are optional - only present in file list response, not in full config
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "createdAt", skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(rename = "updatedAt", skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// Full user OpenCode config (for container startup)
/// Note: API returns snake_case fields
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserOpencodeConfig {
    #[serde(default)]
    pub settings: UserOpencodeSettings,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agents_md: Option<String>,
    #[serde(default)]
    pub files: Vec<UserOpencodeFile>,
}

/// Response wrapper for user config
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserOpencodeConfigResponse {
    #[serde(flatten)]
    pub config: UserOpencodeConfig,
}

/// Response wrapper for settings update
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdateResponse {
    pub success: bool,
    pub settings: UserOpencodeSettings,
}

/// Response wrapper for file list
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesListResponse {
    pub files: Vec<UserOpencodeFile>,
}

// =============================================================================
// Anthropic OAuth Types
// =============================================================================

/// Anthropic OAuth mode (Claude Pro/Max subscription vs API Console)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum AnthropicAuthMode {
    /// Claude Pro/Max subscription (free API access)
    Max,
    /// API Console (creates permanent API key)
    #[default]
    Console,
}

/// Response from initializing Anthropic OAuth flow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnthropicOAuthInitResponse {
    /// Authorization URL to open in browser
    pub auth_url: String,
    /// State ID to track this OAuth flow
    pub state_id: String,
    /// Auth mode being used
    pub auth_mode: String, // "max" or "console"
    /// Seconds until expiration
    pub expires_in: u32,
    /// Human-readable message
    pub message: String,
}

/// Request to complete Anthropic OAuth flow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnthropicOAuthCallbackRequest {
    /// Authorization code (may include state: "authcode#state")
    pub code: String,
    /// State ID if not included in code
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_id: Option<String>,
}

/// Response from completing Anthropic OAuth flow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnthropicOAuthCallbackResponse {
    /// Whether authentication succeeded
    pub success: bool,
    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
