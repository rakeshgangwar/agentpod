//! CodeOpen - Portable Command Center for OpenCode
//!
//! This is the Tauri backend for the CodeOpen desktop/mobile app.
//! It provides secure connection management and API client functionality
//! for communicating with the Management API.

pub mod commands;
pub mod models;
pub mod services;

use commands::{
    connect, disconnect, get_connection_status, test_connection,
    list_projects, get_project, create_project, delete_project,
    start_project, stop_project, restart_project,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Connection commands
            connect,
            disconnect,
            test_connection,
            get_connection_status,
            // Project commands
            list_projects,
            get_project,
            create_project,
            delete_project,
            start_project,
            stop_project,
            restart_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
