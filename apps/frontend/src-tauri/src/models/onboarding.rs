//! Onboarding types for the AgentPod Tauri app
//! These models mirror the Management API onboarding types

use serde::{Deserialize, Serialize};

/// Onboarding session status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum OnboardingStatus {
    Pending,
    Started,
    Gathering,
    Generating,
    Applying,
    Completed,
    Skipped,
    Failed,
}

/// Onboarding requirements gathered from user
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingRequirements {
    pub project_type: String,
    pub project_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frameworks: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub build_tools: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub testing_framework: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formatter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preferred_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preferred_small_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coding_style: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_instructions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_context: Option<serde_json::Value>,
}

/// Agent definition in generated config
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDefinition {
    pub name: String,
    pub description: String,
    pub content: String,
}

/// Command definition in generated config
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandDefinition {
    pub name: String,
    pub description: String,
    pub content: String,
}

/// MCP server definition in generated config
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerDefinition {
    pub name: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<std::collections::HashMap<String, String>>,
}

/// Generated configuration from onboarding
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedConfig {
    pub settings: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agents_md: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agents: Option<Vec<AgentDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commands: Option<Vec<CommandDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp_servers: Option<Vec<McpServerDefinition>>,
}

/// Onboarding session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingSession {
    pub id: String,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox_id: Option<String>,
    pub status: OnboardingStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gathered_requirements: Option<OnboardingRequirements>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generated_config: Option<GeneratedConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_small_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

/// Response wrapper for onboarding session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingSessionResponse {
    pub session: OnboardingSession,
}

/// Result of applying onboarding config
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyConfigResult {
    pub success: bool,
    pub files_written: Vec<String>,
    pub session: OnboardingSession,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Input for completing onboarding
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteOnboardingInput {
    pub config: GeneratedConfig,
}

/// Input for resetting onboarding
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetOnboardingInput {
    #[serde(default)]
    pub preserve_models: bool,
}

/// Input for creating onboarding session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOnboardingInput {
    pub sandbox_id: String,
}
