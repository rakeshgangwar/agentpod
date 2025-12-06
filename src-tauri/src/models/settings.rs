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
