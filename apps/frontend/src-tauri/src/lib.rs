//! AgentPod - Portable Command Center for OpenCode
//!
//! This is the Tauri backend for the AgentPod desktop/mobile app.
//! It provides secure connection management and API client functionality
//! for communicating with the Management API.

pub mod commands;
pub mod models;
pub mod services;

#[cfg(feature = "voice")]
pub mod voice;

use commands::{
    apply_onboarding_config,
    auth_get_status,
    auth_get_token,
    auth_get_user,
    auth_is_authenticated,
    auth_logout,
    // Auth commands (Better Auth session tokens)
    auth_store_session,
    cancel_oauth_flow,
    check_docker_health,
    check_image_exists,
    checkout_sandbox_branch,
    commit_sandbox_changes,
    complete_onboarding,
    configure_provider_api_key,
    // Connection commands
    connect,
    create_onboarding_session,
    create_sandbox,
    create_sandbox_branch,
    delete_sandbox,
    delete_sandbox_branch,
    delete_user_opencode_file,
    disconnect,
    // Sandbox commands (v2, direct Docker orchestration)
    docker_health,
    // Preview port commands (web preview)
    detect_sandbox_preview_ports,
    delete_sandbox_preview_port,
    exec_in_sandbox,
    export_settings,
    get_all_pending_permissions,
    get_connection_status,
    get_default_container_flavor,
    get_default_provider,
    get_default_resource_tier,
    get_docker_info,
    // Docker image management commands
    get_flavor_images,
    get_sandbox_preview_ports,
    // Onboarding commands
    get_onboarding_session,
    get_onboarding_session_by_id,
    get_sandbox,
    get_sandbox_diff,
    get_sandbox_file_diff,
    get_sandbox_git_log,
    get_sandbox_git_status,
    get_sandbox_logs,
    get_sandbox_stats,
    get_sandbox_status,
    // Settings commands
    get_settings,
    // User OpenCode config commands
    get_user_opencode_config,
    import_settings,
    init_oauth_flow,
    // Agent catalog commands
    list_agent_catalog,
    list_configured_providers,
    // Container addon commands
    list_container_addons,
    // Container flavor commands
    list_container_flavors,
    list_non_gpu_addons,
    list_providers,
    // Provider commands
    list_providers_with_models,
    // Resource tier commands (modular containers)
    list_resource_tiers,
    // Git branch and diff commands
    list_sandbox_branches,
    list_sandboxes,
    list_user_opencode_files,
    pause_sandbox,
    poll_oauth_flow,
    pull_image_sync,
    remove_provider_credentials,
    reset_onboarding,
    register_sandbox_preview_port,
    restart_sandbox,
    sandbox_opencode_abort_session,
    sandbox_opencode_create_session,
    sandbox_opencode_delete_session,
    sandbox_opencode_find_files,
    sandbox_opencode_fork_session,
    sandbox_opencode_get_agents,
    // Sandbox OpenCode commands (v2)
    sandbox_opencode_get_app_info,
    sandbox_opencode_get_file_content,
    sandbox_opencode_get_message,
    sandbox_opencode_get_pending_permissions,
    sandbox_opencode_get_providers,
    sandbox_opencode_get_session,
    sandbox_opencode_health_check,
    sandbox_opencode_list_files,
    sandbox_opencode_list_messages,
    sandbox_opencode_list_sessions,
    sandbox_opencode_respond_permission,
    sandbox_opencode_revert_message,
    sandbox_opencode_send_message,
    sandbox_opencode_unrevert_session,
    save_settings,
    set_default_provider,
    share_sandbox_preview_port,
    skip_onboarding,
    start_onboarding,
    start_sandbox,
    stop_sandbox,
    // Terminal commands (interactive shell)
    terminal_connect,
    terminal_disconnect,
    terminal_disconnect_all,
    terminal_list,
    terminal_resize,
    terminal_send_input,
    test_connection,
    unpause_sandbox,
    wake_sandbox,
    unshare_sandbox_preview_port,
    update_user_agents_md,
    update_user_opencode_settings,
    upsert_user_opencode_file,
};

#[cfg(feature = "voice")]
use commands::{
    voice_cancel_recording,
    voice_delete_model,
    voice_download_model,
    voice_get_audio_level,
    voice_get_config,
    voice_get_default_input_device,
    voice_get_recording_duration,
    voice_is_model_downloaded,
    voice_is_model_loaded,
    voice_is_recording,
    voice_list_available_models,
    voice_list_downloaded_models,
    voice_list_input_devices,
    voice_load_model,
    voice_set_config,
    voice_set_enabled,
    voice_set_language,
    voice_set_mode,
    voice_set_push_to_talk_key,
    // Voice input commands
    voice_start_recording,
    voice_stop_recording,
    voice_unload_model,
    // Wake word commands
    wakeword_are_models_downloaded,
    wakeword_download_builtin,
    wakeword_download_feature_models,
    wakeword_get_config,
    wakeword_get_loaded_models,
    wakeword_init_processor,
    wakeword_is_initialized,
    wakeword_is_listening,
    wakeword_list_models,
    wakeword_load_model,
    wakeword_reset,
    wakeword_set_config,
    wakeword_start_listening,
    wakeword_stop_listening,
    wakeword_unload_model,
};
use tauri::{Manager, RunEvent, WindowEvent};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing subscriber for logging
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env()
            .add_directive("agentpod_lib=debug".parse().unwrap())
            .add_directive("tauri_plugin_mcp=debug".parse().unwrap()))
        .init();

    tracing::info!("Starting AgentPod with tracing enabled");

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_http::init());

    #[cfg(all(debug_assertions, desktop))]
    {
        tracing::info!("Development build detected, enabling MCP plugin for AI agent debugging");
        builder = builder.plugin(tauri_plugin_mcp::init_with_config(
            tauri_plugin_mcp::PluginConfig::new("agentpod".to_string())
                .socket_path(std::path::PathBuf::from("/tmp/tauri-mcp.sock"))
                .start_socket_server(true)
        ));
    }

    // Voice input state (only when voice feature is enabled)
    #[cfg(feature = "voice")]
    {
        builder = builder.manage(voice::VoiceState::new());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            // Auth commands (Better Auth session tokens)
            auth_store_session,
            auth_get_status,
            auth_logout,
            auth_get_user,
            auth_get_token,
            auth_is_authenticated,
            // Connection commands
            connect,
            disconnect,
            test_connection,
            get_connection_status,
            // Sandbox commands (v2, direct Docker orchestration)
            docker_health,
            list_sandboxes,
            get_sandbox,
            create_sandbox,
            delete_sandbox,
            start_sandbox,
            stop_sandbox,
            restart_sandbox,
            pause_sandbox,
            unpause_sandbox,
            wake_sandbox,
            get_sandbox_logs,
            get_sandbox_stats,
            get_sandbox_status,
            exec_in_sandbox,
            get_sandbox_git_status,
            get_sandbox_git_log,
            commit_sandbox_changes,
            // Git branch and diff commands
            list_sandbox_branches,
            create_sandbox_branch,
            checkout_sandbox_branch,
            delete_sandbox_branch,
            get_sandbox_diff,
            get_sandbox_file_diff,
            // Sandbox OpenCode commands (v2)
            sandbox_opencode_get_app_info,
            sandbox_opencode_health_check,
            sandbox_opencode_get_providers,
            sandbox_opencode_get_agents,
            sandbox_opencode_list_sessions,
            sandbox_opencode_create_session,
            sandbox_opencode_get_session,
            sandbox_opencode_delete_session,
            sandbox_opencode_abort_session,
            sandbox_opencode_respond_permission,
            sandbox_opencode_get_pending_permissions,
            get_all_pending_permissions,
            sandbox_opencode_fork_session,
            sandbox_opencode_revert_message,
            sandbox_opencode_unrevert_session,
            sandbox_opencode_list_messages,
            sandbox_opencode_send_message,
            sandbox_opencode_get_message,
            sandbox_opencode_list_files,
            sandbox_opencode_get_file_content,
            sandbox_opencode_find_files,
            // Preview port commands (web preview)
            get_sandbox_preview_ports,
            detect_sandbox_preview_ports,
            register_sandbox_preview_port,
            delete_sandbox_preview_port,
            share_sandbox_preview_port,
            unshare_sandbox_preview_port,
            // Terminal commands (interactive shell)
            terminal_connect,
            terminal_send_input,
            terminal_resize,
            terminal_disconnect,
            terminal_list,
            terminal_disconnect_all,
            // Docker image management commands
            get_flavor_images,
            check_image_exists,
            pull_image_sync,
            get_docker_info,
            check_docker_health,
            // Resource tier commands (modular containers)
            list_resource_tiers,
            get_default_resource_tier,
            // Container flavor commands
            list_container_flavors,
            get_default_container_flavor,
            // Container addon commands
            list_container_addons,
            list_non_gpu_addons,
            // Agent catalog commands
            list_agent_catalog,
            // Settings commands
            get_settings,
            save_settings,
            list_providers,
            get_default_provider,
            export_settings,
            import_settings,
            // Provider commands
            list_providers_with_models,
            list_configured_providers,
            configure_provider_api_key,
            init_oauth_flow,
            poll_oauth_flow,
            cancel_oauth_flow,
            remove_provider_credentials,
            set_default_provider,
            // User OpenCode config commands
            get_user_opencode_config,
            update_user_opencode_settings,
            update_user_agents_md,
            list_user_opencode_files,
            upsert_user_opencode_file,
            delete_user_opencode_file,
            // Onboarding commands
            get_onboarding_session,
            get_onboarding_session_by_id,
            create_onboarding_session,
            start_onboarding,
            skip_onboarding,
            complete_onboarding,
            apply_onboarding_config,
            reset_onboarding,
            // Voice input commands (only when voice feature is enabled)
            #[cfg(feature = "voice")]
            voice_start_recording,
            #[cfg(feature = "voice")]
            voice_stop_recording,
            #[cfg(feature = "voice")]
            voice_cancel_recording,
            #[cfg(feature = "voice")]
            voice_get_audio_level,
            #[cfg(feature = "voice")]
            voice_is_recording,
            #[cfg(feature = "voice")]
            voice_get_recording_duration,
            #[cfg(feature = "voice")]
            voice_list_available_models,
            #[cfg(feature = "voice")]
            voice_list_downloaded_models,
            #[cfg(feature = "voice")]
            voice_download_model,
            #[cfg(feature = "voice")]
            voice_delete_model,
            #[cfg(feature = "voice")]
            voice_load_model,
            #[cfg(feature = "voice")]
            voice_unload_model,
            #[cfg(feature = "voice")]
            voice_is_model_loaded,
            #[cfg(feature = "voice")]
            voice_is_model_downloaded,
            #[cfg(feature = "voice")]
            voice_get_config,
            #[cfg(feature = "voice")]
            voice_set_config,
            #[cfg(feature = "voice")]
            voice_set_enabled,
            #[cfg(feature = "voice")]
            voice_set_mode,
            #[cfg(feature = "voice")]
            voice_set_language,
            #[cfg(feature = "voice")]
            voice_set_push_to_talk_key,
            #[cfg(feature = "voice")]
            voice_list_input_devices,
            #[cfg(feature = "voice")]
            voice_get_default_input_device,
            // Wake word commands
            #[cfg(feature = "voice")]
            wakeword_are_models_downloaded,
            #[cfg(feature = "voice")]
            wakeword_download_feature_models,
            #[cfg(feature = "voice")]
            wakeword_init_processor,
            #[cfg(feature = "voice")]
            wakeword_is_initialized,
            #[cfg(feature = "voice")]
            wakeword_list_models,
            #[cfg(feature = "voice")]
            wakeword_download_builtin,
            #[cfg(feature = "voice")]
            wakeword_load_model,
            #[cfg(feature = "voice")]
            wakeword_unload_model,
            #[cfg(feature = "voice")]
            wakeword_get_loaded_models,
            #[cfg(feature = "voice")]
            wakeword_get_config,
            #[cfg(feature = "voice")]
            wakeword_set_config,
            #[cfg(feature = "voice")]
            wakeword_is_listening,
            #[cfg(feature = "voice")]
            wakeword_start_listening,
            #[cfg(feature = "voice")]
            wakeword_stop_listening,
            #[cfg(feature = "voice")]
            wakeword_reset,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Handle window events (desktop only - mobile has single window)
            #[cfg(desktop)]
            if let RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { .. },
                ..
            } = &event
            {
                // When main window close is requested, close all service windows first
                if label == "main" {
                    tracing::info!("Main window closing, closing all service windows");
                    let windows = app_handle.webview_windows();
                    for (window_label, window) in windows {
                        // Close all windows that start with "service-"
                        if window_label.starts_with("service-") {
                            tracing::debug!("Closing service window: {}", window_label);
                            let _ = window.destroy();
                        }
                    }
                }
            }

            // Suppress unused variable warnings on mobile
            #[cfg(mobile)]
            let _ = (&app_handle, &event);
        });
}
