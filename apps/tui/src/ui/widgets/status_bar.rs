use ratatui::Frame;
use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::widgets::Paragraph;

/// Render a status bar
pub fn render(frame: &mut Frame, message: &str, style: Style, area: Rect) {
    let status_bar = Paragraph::new(message).style(style);
    frame.render_widget(status_bar, area);
}
