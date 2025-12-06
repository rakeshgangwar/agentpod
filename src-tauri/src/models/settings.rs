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
