#!/bin/bash
set -e

echo "=== OpenCode Container Starting ==="

# =============================================================================
# Create auth.json for OpenCode authentication
# =============================================================================
OPENCODE_DATA_DIR="${HOME}/.local/share/opencode"
AUTH_FILE="${OPENCODE_DATA_DIR}/auth.json"

mkdir -p "$OPENCODE_DATA_DIR"

# If OPENCODE_AUTH_JSON is provided, write it directly to auth.json
# This is the preferred method - Management API builds the complete auth.json
if [ -n "$OPENCODE_AUTH_JSON" ]; then
    echo "Writing auth.json from OPENCODE_AUTH_JSON environment variable..."
    echo "$OPENCODE_AUTH_JSON" > "$AUTH_FILE"
    echo "Auth configuration complete. Providers configured:"
    cat "$AUTH_FILE" | jq 'keys' 2>/dev/null || echo "(could not parse JSON)"
else
    # Fallback: Initialize empty auth.json if nothing provided
    echo "No OPENCODE_AUTH_JSON provided. Starting with empty auth configuration."
    echo "{}" > "$AUTH_FILE"
fi

# =============================================================================
# Create opencode.json for OpenCode configuration (permissions, MCP, etc.)
# =============================================================================
CONFIG_FILE="/workspace/opencode.json"

# If OPENCODE_CONFIG_JSON is provided, write it to opencode.json in workspace
# This configures permissions, MCP servers, and other settings
if [ -n "$OPENCODE_CONFIG_JSON" ]; then
    echo "Writing opencode.json from OPENCODE_CONFIG_JSON environment variable..."
    echo "$OPENCODE_CONFIG_JSON" > "$CONFIG_FILE"
    echo "OpenCode configuration complete:"
    cat "$CONFIG_FILE" | jq '.' 2>/dev/null || echo "(could not parse JSON)"
else
    # Create a default opencode.json with secure permission defaults
    echo "No OPENCODE_CONFIG_JSON provided. Creating default secure configuration..."
    cat > "$CONFIG_FILE" << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": "ask",
    "edit": "grant",
    "read": "grant",
    "write": "ask",
    "glob": "grant",
    "grep": "grant",
    "webfetch": "ask",
    "todoread": "grant",
    "todowrite": "grant",
    "mcp": "ask"
  }
}
EOF
    echo "Default permission configured (bash, write, webfetch, mcp require approval)"
fi

# =============================================================================
# Clone repository
# =============================================================================

# Clone project if workspace is empty and repo URL is provided
if [ ! -d "/workspace/.git" ] && [ -n "$FORGEJO_REPO_URL" ]; then
    echo "Cloning repository from Forgejo..."
    
    # If credentials are provided, use them
    if [ -n "$FORGEJO_USER" ] && [ -n "$FORGEJO_TOKEN" ]; then
        # Extract host from URL and inject credentials
        REPO_URL_WITH_AUTH=$(echo "$FORGEJO_REPO_URL" | sed "s|://|://${FORGEJO_USER}:${FORGEJO_TOKEN}@|")
        git clone "$REPO_URL_WITH_AUTH" /workspace
    else
        git clone "$FORGEJO_REPO_URL" /workspace
    fi
    
    echo "Repository cloned successfully."
elif [ -d "/workspace/.git" ]; then
    echo "Existing git repository found in workspace."
else
    echo "No repository URL provided and no existing repo. Starting with empty workspace."
fi

# Configure git for commits made by OpenCode
git config --global user.email "${GIT_USER_EMAIL:-opencode@portable-command-center.local}"
git config --global user.name "${GIT_USER_NAME:-OpenCode}"
git config --global --add safe.directory /workspace

# Display startup info
echo "=== Configuration ==="
echo "Workspace: /workspace"
echo "OpenCode Port: ${OPENCODE_PORT:-4096}"
echo "ACP Gateway Port: ${ACP_GATEWAY_PORT:-4097}"
echo "Host: ${OPENCODE_HOST:-0.0.0.0}"
echo "===================="

# Move to workspace
cd /workspace

# =============================================================================
# Start ACP Gateway
# =============================================================================
echo "Starting ACP Gateway..."
cd /opt/acp-gateway
bun run src/index.ts &
ACP_PID=$!
cd /workspace

# Wait for ACP Gateway to be ready
echo "Waiting for ACP Gateway to start..."
for i in {1..30}; do
    if curl -sf "http://localhost:${ACP_GATEWAY_PORT:-4097}/health" > /dev/null 2>&1; then
        echo "ACP Gateway is ready."
        break
    fi
    sleep 1
done

# =============================================================================
# Handle shutdown gracefully
# =============================================================================
cleanup() {
    echo "Shutting down..."
    if [ -n "$ACP_PID" ]; then
        kill "$ACP_PID" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup SIGTERM SIGINT

# =============================================================================
# Keep container running
# The ACP Gateway handles all communication with agents
# =============================================================================
echo "Container ready. ACP Gateway running on port ${ACP_GATEWAY_PORT:-4097}"
echo "Available agents: opencode, claude-code, gemini-cli, qwen-code, codex"

# Wait for ACP Gateway process
wait $ACP_PID
