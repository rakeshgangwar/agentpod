use anyhow::Result;
use crossterm::event::{Event, EventStream, KeyCode, KeyEvent, KeyModifiers};
use futures_util::StreamExt;
use tokio::sync::mpsc;
use tokio::time::{interval, Duration};

/// Events that can occur in the application
#[derive(Debug, Clone)]
pub enum AppEvent {
    /// Terminal input event (keyboard, mouse)
    Terminal(KeyEvent),
    /// Tick event for periodic updates
    Tick,
    /// Quit the application
    Quit,
    /// API response
    ApiResult(ApiResult),
    /// Connection status changed
    ConnectionStatus(bool),
}

/// API response types
#[derive(Debug, Clone)]
pub enum ApiResult {
    /// Successful login
    LoginSuccess { token: String },
    /// Login failed
    LoginError { message: String },
    /// Sandboxes loaded
    SandboxesLoaded { sandboxes: Vec<serde_json::Value> },
    /// Generic success
    Success { message: String },
    /// Generic error
    Error { message: String },
}

/// Event loop that handles terminal input, ticks, and async events
pub struct EventLoop {
    event_tx: mpsc::UnboundedSender<AppEvent>,
    event_rx: mpsc::UnboundedReceiver<AppEvent>,
}

impl EventLoop {
    pub fn new() -> Self {
        let (event_tx, event_rx) = mpsc::unbounded_channel();
        Self { event_tx, event_rx }
    }

    /// Get a sender for posting events from async tasks
    pub fn sender(&self) -> mpsc::UnboundedSender<AppEvent> {
        self.event_tx.clone()
    }

    /// Wait for the next event
    pub async fn next(&mut self) -> Result<AppEvent> {
        let mut crossterm_events = EventStream::new();
        let mut tick = interval(Duration::from_millis(16)); // ~60fps

        tokio::select! {
            // Handle terminal events (keyboard, mouse)
            Some(Ok(event)) = crossterm_events.next() => {
                match event {
                    Event::Key(key_event) => {
                        // Handle Ctrl+C globally
                        if key_event.code == KeyCode::Char('c') && key_event.modifiers.contains(KeyModifiers::CONTROL) {
                            return Ok(AppEvent::Quit);
                        }
                        Ok(AppEvent::Terminal(key_event))
                    }
                    _ => Ok(AppEvent::Tick), // Ignore other events for now
                }
            }
            // Handle tick events
            _ = tick.tick() => {
                Ok(AppEvent::Tick)
            }
            // Handle async events from API tasks
            Some(event) = self.event_rx.recv() => {
                Ok(event)
            }
        }
    }
}
