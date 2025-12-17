//! Onboarding commands for the AgentPod app
//!
//! These commands communicate with the Management API's onboarding endpoints.

use crate::models::{
    AppError, OnboardingSession, OnboardingSessionResponse,
    ApplyConfigResult, CompleteOnboardingInput, ResetOnboardingInput,
    CreateOnboardingInput, GeneratedConfig,
};
use crate::services::ApiClient;

/// Get onboarding session for a sandbox
#[tauri::command]
pub async fn get_onboarding_session(sandbox_id: String) -> Result<Option<OnboardingSession>, AppError> {
    let client = ApiClient::new()?;
    let path = format!("/api/onboarding/sandbox/{}", sandbox_id);
    
    // The API returns 404 if no session exists, which we treat as None
    match client.get::<OnboardingSessionResponse>(&path).await {
        Ok(response) => Ok(Some(response.session)),
        Err(AppError::ApiError(msg)) if msg.contains("404") || msg.contains("not found") => Ok(None),
        Err(e) => Err(e),
    }
}

/// Get onboarding session by ID
#[tauri::command]
pub async fn get_onboarding_session_by_id(session_id: String) -> Result<OnboardingSession, AppError> {
    let client = ApiClient::new()?;
    let path = format!("/api/onboarding/{}", session_id);
    let response: OnboardingSessionResponse = client.get(&path).await?;
    Ok(response.session)
}

/// Create a new onboarding session for a sandbox
#[tauri::command]
pub async fn create_onboarding_session(sandbox_id: String) -> Result<OnboardingSession, AppError> {
    let client = ApiClient::new()?;
    let input = CreateOnboardingInput { sandbox_id };
    let response: OnboardingSessionResponse = client.post("/api/onboarding", &input).await?;
    Ok(response.session)
}

/// Start an onboarding session (changes status from pending to started)
#[tauri::command]
pub async fn start_onboarding(session_id: String) -> Result<OnboardingSession, AppError> {
    let client = ApiClient::new()?;
    let path = format!("/api/onboarding/{}/start", session_id);
    let response: OnboardingSessionResponse = client.post(&path, &serde_json::json!({})).await?;
    Ok(response.session)
}

/// Skip onboarding for a session
#[tauri::command]
pub async fn skip_onboarding(session_id: String) -> Result<OnboardingSession, AppError> {
    let client = ApiClient::new()?;
    let path = format!("/api/onboarding/{}/skip", session_id);
    let response: OnboardingSessionResponse = client.post(&path, &serde_json::json!({})).await?;
    Ok(response.session)
}

/// Complete onboarding with generated config
#[tauri::command]
pub async fn complete_onboarding(
    session_id: String,
    config: GeneratedConfig,
) -> Result<OnboardingSession, AppError> {
    let client = ApiClient::new()?;
    let path = format!("/api/onboarding/{}/complete", session_id);
    let input = CompleteOnboardingInput { config };
    let response: OnboardingSessionResponse = client.post(&path, &input).await?;
    Ok(response.session)
}

/// Apply onboarding configuration to the sandbox
#[tauri::command]
pub async fn apply_onboarding_config(
    session_id: String,
    reload: Option<bool>,
) -> Result<ApplyConfigResult, AppError> {
    let client = ApiClient::new()?;
    let reload_param = reload.unwrap_or(true);
    let path = format!("/api/onboarding/{}/apply?reload={}", session_id, reload_param);
    let result: ApplyConfigResult = client.post(&path, &serde_json::json!({})).await?;
    Ok(result)
}

/// Reset onboarding session to start over
#[tauri::command]
pub async fn reset_onboarding(
    session_id: String,
    preserve_models: Option<bool>,
) -> Result<OnboardingSession, AppError> {
    let client = ApiClient::new()?;
    let path = format!("/api/onboarding/{}/reset", session_id);
    let input = ResetOnboardingInput {
        preserve_models: preserve_models.unwrap_or(false),
    };
    let response: OnboardingSessionResponse = client.post(&path, &input).await?;
    Ok(response.session)
}
