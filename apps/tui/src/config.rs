use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub connection: ConnectionConfig,
    
    #[serde(default)]
    pub defaults: DefaultsConfig,
    
    #[serde(default)]
    pub ui: UiConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    #[serde(default = "default_api_url")]
    pub api_url: String,
    
    #[serde(default)]
    pub api_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultsConfig {
    #[serde(default = "default_flavor")]
    pub flavor: String,
    
    #[serde(default = "default_resource_tier")]
    pub resource_tier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiConfig {
    #[serde(default = "default_theme")]
    pub theme: String,
    
    #[serde(default = "default_scroll_speed")]
    pub scroll_speed: u16,
    
    #[serde(default)]
    pub embedded_terminal: bool,
}

impl Default for ConnectionConfig {
    fn default() -> Self {
        Self {
            api_url: default_api_url(),
            api_token: None,
        }
    }
}

impl Default for DefaultsConfig {
    fn default() -> Self {
        Self {
            flavor: default_flavor(),
            resource_tier: default_resource_tier(),
        }
    }
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            scroll_speed: default_scroll_speed(),
            embedded_terminal: false,
        }
    }
}

fn default_api_url() -> String {
    "http://localhost:3001".to_string()
}

fn default_flavor() -> String {
    "fullstack".to_string()
}

fn default_resource_tier() -> String {
    "builder".to_string()
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_scroll_speed() -> u16 {
    3
}

impl Config {
    pub fn load(config_path: Option<&Path>) -> Result<Self> {
        let path = match config_path {
            Some(p) => p.to_path_buf(),
            None => Self::default_path()?,
        };
        
        if path.exists() {
            let content = std::fs::read_to_string(&path)
                .with_context(|| format!("Failed to read config file: {}", path.display()))?;
            
            let config: Config = toml::from_str(&content)
                .with_context(|| format!("Failed to parse config file: {}", path.display()))?;
            
            Ok(config)
        } else {
            // Create default config
            let config = Config::default();
            config.save(&path)?;
            Ok(config)
        }
    }
    
    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let content = toml::to_string_pretty(self)?;
        std::fs::write(path, content)?;
        
        Ok(())
    }
    
    fn default_path() -> Result<PathBuf> {
        let config_dir = dirs::config_dir()
            .context("Could not determine config directory")?;
        
        Ok(config_dir.join("agentpod").join("config.toml"))
    }
    
    pub fn effective_api_url(&self, cli_url: Option<&str>) -> String {
        cli_url.unwrap_or(&self.connection.api_url).to_string()
    }
    
    pub fn effective_token(&self, cli_token: Option<&str>) -> Option<String> {
        cli_token
            .map(|s| s.to_string())
            .or_else(|| self.connection.api_token.clone())
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            connection: ConnectionConfig::default(),
            defaults: DefaultsConfig::default(),
            ui: UiConfig::default(),
        }
    }
}
