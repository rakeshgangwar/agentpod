use ratatui::Frame;
use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::widgets::{Block, Borders, Paragraph};

use crate::app::App;

pub fn render(frame: &mut Frame, _app: &App, area: Rect) {
    let block = Block::default()
        .title("Settings")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::DarkGray));

    let content = Paragraph::new(
        "Settings - Coming soon!\n\nConfigure connection, defaults, and theme.",
    )
    .block(block)
    .style(Style::default().fg(Color::DarkGray));

    frame.render_widget(content, area);
}
