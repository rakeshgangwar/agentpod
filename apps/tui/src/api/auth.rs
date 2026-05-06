use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::ApiClient;

/// Login request
#[derive(Debug, Serialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

/// Login response
#[derive(Debug, Deserialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserInfo,
}

/// User info
#[derive(Debug, Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
}

/// Session response
#[derive(Debug, Deserialize)]
pub struct SessionResponse {
    pub user: UserInfo,
}

impl ApiClient {
    /// Login with email and password
    pub async fn login(&self, email: &str, password: &str) -> Result<LoginResponse> {
        let request = LoginRequest {
            email: email.to_string(),
            password: password.to_string(),
        };

        self.post("/api/auth/sign-in/email", &request).await
    }

    /// Get current session
    pub async fn get_session(&self) -> Result<SessionResponse> {
        self.get("/api/auth/session").await
    }

    /// Sign out
    pub async fn sign_out(&self) -> Result<()> {
        self.post("/api/auth/sign-out", &serde_json::json!({})).await
    }
}
