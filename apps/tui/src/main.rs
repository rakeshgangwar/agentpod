use clap::Parser;
use anyhow::Result;

mod app;
mod cli;
mod config;
mod event;
mod types;
mod api;
mod terminal;
mod ui;
mod util;

use cli::Cli;
use config::Config;
use app::App;
use event::EventLoop;

#[tokio::main]
async fn main() -> Result<()> {
    // Parse CLI arguments
    let cli = Cli::parse();
    
    // Initialize logging
    if cli.debug {
        tracing_subscriber::fmt()
            .with_env_filter("agentpod_tui=debug")
            .init();
    }
    
    // Load config
    let config = Config::load(cli.config.as_deref())?;
    
    // Initialize terminal
    let mut terminal = ratatui::init();
    terminal.clear()?;
    
    // Create app and event loop
    let mut app = App::new(config, cli);
    let mut event_loop = EventLoop::new();
    
    // Run the app
    let result = run(&mut terminal, &mut app, &mut event_loop).await;
    
    // Restore terminal
    ratatui::restore();
    
    result
}

async fn run(
    terminal: &mut ratatui::DefaultTerminal,
    app: &mut App,
    event_loop: &mut EventLoop,
) -> Result<()> {
    loop {
        // Render UI
        terminal.draw(|frame| app.render(frame))?;
        
        // Handle events
        match event_loop.next().await? {
            event::AppEvent::Terminal(key_event) => {
                app.handle_key_event(key_event).await;
            }
            event::AppEvent::Tick => {
                app.tick().await;
            }
            event::AppEvent::Quit => {
                return Ok(());
            }
            event::AppEvent::ApiResult(result) => {
                app.handle_api_result(result);
            }
            event::AppEvent::ConnectionStatus(connected) => {
                app.handle_connection_status(connected);
            }
        }
        
        if app.should_quit {
            return Ok(());
        }
    }
}
