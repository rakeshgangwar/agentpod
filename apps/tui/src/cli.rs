use clap::Parser;
use std::path::PathBuf;

/// AgentPod TUI - Terminal interface for managing AI coding sandboxes
#[derive(Parser, Debug, Clone)]
#[command(name = "agentpod-tui", version, about, long_about = None)]
pub struct Cli {
    /// API URL (overrides config file)
    #[arg(long, short = 'u')]
    pub api_url: Option<String>,
    
    /// API token for authentication (overrides config file)
    #[arg(long, short = 't')]
    pub token: Option<String>,
    
    /// Path to config file
    #[arg(long, short = 'c')]
    pub config: Option<PathBuf>,
    
    /// Use embedded terminal instead of external (tmux)
    #[arg(long)]
    pub embedded_terminal: bool,
    
    /// Enable debug logging
    #[arg(long, short = 'd')]
    pub debug: bool,
    
    /// Start directly in a specific sandbox
    #[arg(long)]
    pub sandbox: Option<String>,
}
