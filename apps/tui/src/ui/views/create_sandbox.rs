use ratatui::Frame;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Wrap};

use crate::app::{App, CreateSandboxSource, CreateSandboxStep};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Length(22), Constraint::Min(0)])
        .split(area);

    render_steps(frame, app, chunks[0]);
    render_active_step(frame, app, chunks[1]);
}

fn render_steps(frame: &mut Frame, app: &App, area: Rect) {
    let steps = [
        (CreateSandboxStep::Source, "1 Source"),
        (CreateSandboxStep::Details, "2 Details"),
        (CreateSandboxStep::Runtime, "3 Runtime"),
        (CreateSandboxStep::Addons, "4 Add-ons"),
        (CreateSandboxStep::Review, "5 Review"),
    ];

    let items: Vec<ListItem> = steps
        .iter()
        .map(|(step, label)| {
            let active = app.create_sandbox.step == *step;
            let prefix = if active { ">" } else { " " };
            let style = if active {
                Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::DarkGray)
            };
            ListItem::new(format!("{} {}", prefix, label)).style(style)
        })
        .collect();

    frame.render_widget(
        List::new(items).block(Block::default().title("Create").borders(Borders::ALL)),
        area,
    );
}

fn render_active_step(frame: &mut Frame, app: &App, area: Rect) {
    let title = match app.create_sandbox.step {
        CreateSandboxStep::Source => "Source",
        CreateSandboxStep::Details => "Details",
        CreateSandboxStep::Runtime => "Runtime",
        CreateSandboxStep::Addons => "Add-ons",
        CreateSandboxStep::Review => "Review",
    };

    let mut lines = match app.create_sandbox.step {
        CreateSandboxStep::Source => source_lines(app),
        CreateSandboxStep::Details => details_lines(app),
        CreateSandboxStep::Runtime => runtime_lines(app),
        CreateSandboxStep::Addons => addons_lines(app),
        CreateSandboxStep::Review => review_lines(app),
    };

    if let Some(error) = &app.create_sandbox.error {
        lines.push(String::new());
        lines.push(format!("Error: {error}"));
    }

    lines.push(String::new());
    lines.push("Tab focus | Enter next | Esc back | Ctrl+S create on Review".to_string());

    frame.render_widget(
        Paragraph::new(lines.join("\n"))
            .block(Block::default().title(title).borders(Borders::ALL))
            .wrap(Wrap { trim: false }),
        area,
    );
}

fn source_lines(app: &App) -> Vec<String> {
    vec![
        format!(
            "Source: {}",
            match app.create_sandbox.source {
                CreateSandboxSource::Scratch => "scratch",
                CreateSandboxSource::Git => "git",
            }
        ),
        "Space toggles scratch/git.".to_string(),
        format!("Git URL: {}", app.create_sandbox.git_url),
    ]
}

fn details_lines(app: &App) -> Vec<String> {
    vec![
        format!("Name: {}", app.create_sandbox.name),
        format!("Description: {}", app.create_sandbox.description),
    ]
}

fn runtime_lines(app: &App) -> Vec<String> {
    vec![
        format!("Flavor: {}", app.create_sandbox.selected_flavor),
        format!(
            "Resource tier: {}",
            app.create_sandbox.selected_resource_tier
        ),
        "Use Up/Down then Space to select.".to_string(),
    ]
}

fn addons_lines(app: &App) -> Vec<String> {
    vec![
        format!(
            "code-server: {}",
            if app
                .create_sandbox
                .selected_addons
                .iter()
                .any(|addon| addon == "code-server")
            {
                "selected"
            } else {
                "not selected"
            }
        ),
        "Space toggles the focused add-on.".to_string(),
    ]
}

fn review_lines(app: &App) -> Vec<String> {
    vec![
        format!("Source: {:?}", app.create_sandbox.source),
        format!("Git URL: {}", app.create_sandbox.git_url),
        format!("Name: {}", app.create_sandbox.name),
        format!("Description: {}", app.create_sandbox.description),
        format!("Flavor: {}", app.create_sandbox.selected_flavor),
        format!(
            "Resource tier: {}",
            app.create_sandbox.selected_resource_tier
        ),
        format!("Add-ons: {}", app.create_sandbox.selected_addons.join(", ")),
    ]
}
