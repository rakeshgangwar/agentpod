use anyhow::Result;

/// External terminal launcher (tmux)
#[allow(dead_code)]
pub struct ExternalTerminal {
    sandbox_id: String,
}

#[allow(dead_code)]
impl ExternalTerminal {
    pub fn new(sandbox_id: &str) -> Self {
        Self {
            sandbox_id: sandbox_id.to_string(),
        }
    }

    /// Launch tmux session and attach to it
    pub async fn launch(&self) -> Result<()> {
        // TODO: Implement tmux session creation and attachment
        // This would:
        // 1. Check if tmux is installed
        // 2. Create or attach to a tmux session named agentpod-{sandbox_id}
        // 3. Connect to the sandbox terminal via WebSocket
        anyhow::bail!("External terminal not yet implemented")
    }
}
