//! Authentication service for Better Auth
//!
//! This module handles session token storage for Better Auth.
//! The token is obtained from the frontend after successful login
//! and used for API calls from the Rust backend.

use crate::models::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// =============================================================================
// Types
// =============================================================================

/// Stored session data from Better Auth
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    /// Session token from Better Auth
    pub token: String,
    /// User ID
    pub user_id: String,
    /// User email
    pub email: Option<String>,
    /// User name
    pub name: Option<String>,
    /// When the session was stored (Unix timestamp)
    pub stored_at: i64,
}

/// User info for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub email: Option<String>,
    pub name: Option<String>,
}

/// Auth status for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    pub authenticated: bool,
    pub user: Option<UserInfo>,
}

// =============================================================================
// Auth Service
// =============================================================================

const SERVICE_NAME: &str = "agentpod";
const AUTH_KEY: &str = "session_token";

/// Authentication service for Better Auth
pub struct AuthService;

impl AuthService {
    // =========================================================================
    // Storage
    // =========================================================================

    /// Get the auth file path
    fn get_auth_path() -> Result<PathBuf, AppError> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| AppError::StorageError("Could not find config directory".to_string()))?;

        let app_config_dir = config_dir.join("agentpod");
        if !app_config_dir.exists() {
            fs::create_dir_all(&app_config_dir).map_err(|e| {
                AppError::StorageError(format!("Failed to create config dir: {}", e))
            })?;
        }

        Ok(app_config_dir.join("session.json"))
    }

    /// Save session data to secure storage
    pub fn save_session(data: &SessionData) -> Result<(), AppError> {
        let json = serde_json::to_string(data)?;

        // Save to file
        let path = Self::get_auth_path()?;
        fs::write(&path, &json)
            .map_err(|e| AppError::StorageError(format!("Failed to write session file: {}", e)))?;

        // Also try keyring for extra security
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, AUTH_KEY) {
            let _ = entry.set_password(&json);
        }

        tracing::info!("Session saved for user: {}", data.user_id);
        Ok(())
    }

    /// Load session data from storage
    pub fn load_session() -> Result<Option<SessionData>, AppError> {
        // Try file first
        let path = Self::get_auth_path()?;

        if path.exists() {
            let json = fs::read_to_string(&path).map_err(|e| {
                AppError::StorageError(format!("Failed to read session file: {}", e))
            })?;
            let data: SessionData = serde_json::from_str(&json)?;
            return Ok(Some(data));
        }

        // Fallback to keyring
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, AUTH_KEY) {
            if let Ok(json) = entry.get_password() {
                let data: SessionData = serde_json::from_str(&json)?;
                return Ok(Some(data));
            }
        }

        Ok(None)
    }

    /// Delete session data (logout)
    pub fn delete_session() -> Result<(), AppError> {
        // Delete from keyring
        if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, AUTH_KEY) {
            let _ = entry.delete_credential();
        }

        // Delete file
        if let Ok(path) = Self::get_auth_path() {
            let _ = fs::remove_file(path);
        }

        tracing::info!("Session deleted");
        Ok(())
    }

    // =========================================================================
    // Token Access
    // =========================================================================

    /// Get the current session token for API calls
    pub fn get_token() -> Result<Option<String>, AppError> {
        match Self::load_session()? {
            Some(session) => Ok(Some(session.token)),
            None => Ok(None),
        }
    }

    /// Get current auth status
    pub fn get_auth_status() -> Result<AuthStatus, AppError> {
        match Self::load_session()? {
            Some(session) => Ok(AuthStatus {
                authenticated: true,
                user: Some(UserInfo {
                    id: session.user_id,
                    email: session.email,
                    name: session.name,
                }),
            }),
            None => Ok(AuthStatus {
                authenticated: false,
                user: None,
            }),
        }
    }
}
