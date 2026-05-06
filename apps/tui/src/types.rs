use serde::{Deserialize, Serialize};

/// Sandbox status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SandboxStatus {
    Creating,
    Running,
    Stopped,
    Error,
    Paused,
}

impl std::fmt::Display for SandboxStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Creating => write!(f, "creating"),
            Self::Running => write!(f, "running"),
            Self::Stopped => write!(f, "stopped"),
            Self::Error => write!(f, "error"),
            Self::Paused => write!(f, "paused"),
        }
    }
}

/// Sandbox/project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sandbox {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: SandboxStatus,
    pub container_id: Option<String>,
    pub git_url: Option<String>,
    pub flavor_id: Option<String>,
    pub resource_tier_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Container flavor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerFlavor {
    pub id: String,
    pub name: String,
    pub languages: Vec<String>,
    pub image_size_mb: u64,
}

/// Resource tier
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceTier {
    pub id: String,
    pub name: String,
    pub cpu_cores: u32,
    pub memory_gb: f64,
    pub storage_gb: u64,
}

/// LLM Provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub auth_type: String,
    pub is_configured: bool,
    pub is_default: bool,
}

/// Chat session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

/// Git status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub staged: Vec<String>,
    pub unstaged: Vec<String>,
    pub untracked: Vec<String>,
}

/// Git commit
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub message: String,
    pub date: String,
}

/// File node in file browser
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub children: Option<Vec<FileNode>>,
}

/// Connection status
#[derive(Debug, Clone)]
pub struct ConnectionInfo {
    pub api_url: String,
    pub connected: bool,
    pub version: Option<String>,
    pub user_id: Option<String>,
}
