use ratatui::Frame;
use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::widgets::{Block, Borders, Paragraph};

use crate::app::App;

pub fn render(frame: &mut Frame, _app: &App, area: Rect) {
    let block = Block::default()
        .title("Terminal")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::DarkGray));

    let content = Paragraph::new(
        "Terminal view - Coming soon!\n\nPress 't' to open terminal in external tmux session.",
    )
    .block(block)
    .style(Style::default().fg(Color::DarkGray));

    frame.render_widget(content, area);
}
