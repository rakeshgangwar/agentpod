/// Format bytes to human readable string
pub fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

/// Format duration to human readable string
pub fn format_duration(seconds: u64) -> String {
    const MINUTE: u64 = 60;
    const HOUR: u64 = MINUTE * 60;
    const DAY: u64 = HOUR * 24;

    if seconds >= DAY {
        format!("{}d {}h", seconds / DAY, (seconds % DAY) / HOUR)
    } else if seconds >= HOUR {
        format!("{}h {}m", seconds / HOUR, (seconds % HOUR) / MINUTE)
    } else if seconds >= MINUTE {
        format!("{}m {}s", seconds / MINUTE, seconds % MINUTE)
    } else {
        format!("{}s", seconds)
    }
}

/// Truncate string to max width
pub fn truncate(s: &str, max_width: usize) -> String {
    if s.len() <= max_width {
        s.to_string()
    } else {
        format!("{}...", &s[..max_width.saturating_sub(3)])
    }
}
