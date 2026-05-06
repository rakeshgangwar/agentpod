use ratatui::style::{Color, Modifier, Style};

/// Theme colors
pub struct Theme {
    pub primary: Color,
    pub secondary: Color,
    pub success: Color,
    pub warning: Color,
    pub error: Color,
    pub info: Color,
    pub text: Color,
    pub text_dim: Color,
    pub background: Color,
    pub border: Color,
    pub border_active: Color,
}

impl Theme {
    /// Dark theme (default)
    pub fn dark() -> Self {
        Self {
            primary: Color::Cyan,
            secondary: Color::Blue,
            success: Color::Green,
            warning: Color::Yellow,
            error: Color::Red,
            info: Color::Blue,
            text: Color::White,
            text_dim: Color::DarkGray,
            background: Color::Black,
            border: Color::DarkGray,
            border_active: Color::Cyan,
        }
    }

    /// Light theme
    pub fn light() -> Self {
        Self {
            primary: Color::Blue,
            secondary: Color::Magenta,
            success: Color::Green,
            warning: Color::Yellow,
            error: Color::Red,
            info: Color::Cyan,
            text: Color::Black,
            text_dim: Color::Gray,
            background: Color::White,
            border: Color::Gray,
            border_active: Color::Blue,
        }
    }

    /// Get style for primary text
    pub fn primary_style(&self) -> Style {
        Style::default().fg(self.primary)
    }

    /// Get style for success
    pub fn success_style(&self) -> Style {
        Style::default().fg(self.success)
    }

    /// Get style for error
    pub fn error_style(&self) -> Style {
        Style::default().fg(self.error)
    }

    /// Get style for warning
    pub fn warning_style(&self) -> Style {
        Style::default().fg(self.warning)
    }

    /// Get style for dim text
    pub fn dim_style(&self) -> Style {
        Style::default().fg(self.text_dim)
    }

    /// Get style for highlighted text
    pub fn highlight_style(&self) -> Style {
        Style::default()
            .fg(self.primary)
            .add_modifier(Modifier::BOLD)
    }

    /// Get status color for sandbox
    pub fn status_color(&self, status: &str) -> Color {
        match status {
            "running" => self.success,
            "stopped" => self.text_dim,
            "error" => self.error,
            "creating" => self.warning,
            "paused" => self.warning,
            _ => self.text_dim,
        }
    }
}
