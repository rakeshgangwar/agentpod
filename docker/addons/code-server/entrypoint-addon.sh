#!/bin/bash
# =============================================================================
# Code Server Add-on Entrypoint Extension
# This script is sourced by the main entrypoint to start code-server
# =============================================================================

start_code_server() {
    echo "Starting code-server..."
    
    CODE_SERVER_PORT="${CODE_SERVER_PORT:-8080}"
    CODE_SERVER_AUTH="${CODE_SERVER_AUTH:-none}"
    WORKSPACE="${WORKSPACE:-/home/developer/workspace}"
    
    # Start code-server in background
    PORT="${CODE_SERVER_PORT}" code-server \
        --bind-addr "0.0.0.0:${CODE_SERVER_PORT}" \
        --auth "${CODE_SERVER_AUTH}" \
        --disable-telemetry \
        "$WORKSPACE" \
        > /tmp/code-server.log 2>&1 &
    
    echo "  Code Server started."
    echo "  Available at: http://localhost:${CODE_SERVER_PORT}"
}

# Export functions for main entrypoint
export -f start_code_server
