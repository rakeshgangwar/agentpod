use ratatui::Frame;
use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph};

use crate::app::App;

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let block = Block::default()
        .title("Sandboxes")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::DarkGray));

    if app.sandboxes.is_empty() {
        let empty_msg = Paragraph::new("No sandboxes found. Press 'n' to create one.")
            .block(block)
            .style(Style::default().fg(Color::DarkGray));
        frame.render_widget(empty_msg, area);
    } else {
        let items: Vec<ListItem> = app
            .sandboxes
            .iter()
            .enumerate()
            .map(|(i, sandbox)| {
                let _status_color = match sandbox.status.to_string().as_str() {
                    "running" => Color::Green,
                    "stopped" => Color::DarkGray,
                    "error" => Color::Red,
                    "creating" => Color::Yellow,
                    "paused" => Color::Yellow,
                    _ => Color::White,
                };

                let style = if i == app.selected_sandbox {
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(ratatui::style::Modifier::BOLD)
                } else {
                    Style::default().fg(Color::White)
                };

                let content = format!(
                    " {} [{:^10}] {}",
                    if i == app.selected_sandbox { "▶" } else { " " },
                    sandbox.status,
                    sandbox.name
                );

                ListItem::new(content).style(style)
            })
            .collect();

        let list = List::new(items).block(block);
        frame.render_widget(list, area);
    }
}
