use ratatui::Frame;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Style};
use ratatui::widgets::{Block, Borders, Paragraph};

use crate::app::App;

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(5), // Title
            Constraint::Length(3), // Email input
            Constraint::Length(3), // Password input
            Constraint::Min(0),   // Status/help
        ])
        .split(area);

    // Title
    let title = Paragraph::new("AgentPod TUI - Login")
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::DarkGray)),
        )
        .style(Style::default().fg(Color::Cyan));
    frame.render_widget(title, chunks[0]);

    // Email input
    let email = Paragraph::new(format!("Email: {}", app.login_email))
        .block(
            Block::default()
                .title("Email")
                .borders(Borders::ALL)
                .border_style(Style::default().fg(if app.login_focus == 0 {
                    Color::Cyan
                } else {
                    Color::DarkGray
                })),
        );
    frame.render_widget(email, chunks[1]);

    // Password input
    let password_mask = "*".repeat(app.login_password.len());
    let password = Paragraph::new(format!("Password: {}", password_mask))
        .block(
            Block::default()
                .title("Password")
                .borders(Borders::ALL)
                .border_style(Style::default().fg(if app.login_focus == 1 {
                    Color::Cyan
                } else {
                    Color::DarkGray
                })),
        );
    frame.render_widget(password, chunks[2]);

    // Help text
    let help = Paragraph::new("Tab: switch fields | Enter: login | Esc: cancel")
        .style(Style::default().fg(Color::DarkGray));
    frame.render_widget(help, chunks[3]);
}
