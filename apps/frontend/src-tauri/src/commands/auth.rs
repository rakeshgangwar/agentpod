//! Authentication commands for Tauri
//!
//! These commands handle session token storage for Better Auth.
//! The frontend handles the actual authentication flow with Better Auth,
//! then stores the session token here for use in API calls.

use crate::models::AppError;
use crate::services::auth::{AuthService, AuthStatus, SessionData, UserInfo};
use tauri::command;

/// Store a session token from Better Auth
///
/// Called by the frontend after successful login to store the session
/// token for use in subsequent API calls.
#[command]
pub fn auth_store_session(
    token: String,
    user_id: String,
    email: Option<String>,
    name: Option<String>,
) -> Result<(), AppError> {
    tracing::info!("Storing session for user: {}", user_id);

    let session = SessionData {
        token,
        user_id,
        email,
        name,
        stored_at: chrono::Utc::now().timestamp(),
    };

    AuthService::save_session(&session)?;

    tracing::info!("Session stored successfully");
    Ok(())
}

/// Get the current authentication status
#[command]
pub fn auth_get_status() -> Result<AuthStatus, AppError> {
    AuthService::get_auth_status()
}

/// Logout the current user
///
/// Clears the stored session token.
#[command]
pub fn auth_logout() -> Result<(), AppError> {
    tracing::info!("Logging out user");
    AuthService::delete_session()?;
    tracing::info!("User logged out successfully");
    Ok(())
}

/// Get current user info
#[command]
pub fn auth_get_user() -> Result<Option<UserInfo>, AppError> {
    let status = AuthService::get_auth_status()?;
    Ok(status.user)
}

/// Get the current session token
///
/// Returns the stored session token for API calls.
#[command]
pub fn auth_get_token() -> Result<Option<String>, AppError> {
    AuthService::get_token()
}

/// Check if user is authenticated
#[command]
pub fn auth_is_authenticated() -> Result<bool, AppError> {
    let status = AuthService::get_auth_status()?;
    Ok(status.authenticated)
}
