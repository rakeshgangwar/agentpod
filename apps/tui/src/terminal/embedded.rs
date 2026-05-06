use anyhow::Result;

/// Embedded VT100 terminal renderer
#[allow(dead_code)]
pub struct EmbeddedTerminal {
    sandbox_id: String,
}

#[allow(dead_code)]
impl EmbeddedTerminal {
    pub fn new(sandbox_id: &str) -> Self {
        Self {
            sandbox_id: sandbox_id.to_string(),
        }
    }

    /// Start the embedded terminal
    pub async fn start(&self) -> Result<()> {
        // TODO: Implement embedded VT100 terminal
        // This would:
        // 1. Connect to sandbox terminal via WebSocket
        // 2. Parse VT100 escape sequences using vte crate
        // 3. Render terminal output in a ratatui panel
        anyhow::bail!("Embedded terminal not yet implemented")
    }
}
