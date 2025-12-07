#!/bin/bash
set -e

echo "=============================================="
echo "  OpenCode CLI Container v${CONTAINER_VERSION:-0.0.1}"
echo "=============================================="

# =============================================================================
# Environment Variables (expected)
# =============================================================================
# MANAGEMENT_API_URL    - URL of the Management API
# AUTH_TOKEN            - Bearer token for Management API authentication
# USER_ID               - User identifier for fetching config
# PROJECT_SLUG          - Project slug for workspace
# FORGEJO_REPO_URL      - Git repository URL
# FORGEJO_USER          - Git username for auth
# FORGEJO_TOKEN         - Git token for auth
# OPENCODE_AUTH_JSON    - Pre-built auth.json content (for LLM providers)
# OPENCODE_CONFIG_JSON  - Pre-built opencode.json content (optional, fallback)
# OPENCODE_PORT         - Port for OpenCode server (default: 4096)
# OPENCODE_HOST         - Host for OpenCode server (default: 0.0.0.0)
# =============================================================================

HOME_DIR="/home/developer"
WORKSPACE="${HOME_DIR}/workspace"
OPENCODE_CONFIG_DIR="${HOME_DIR}/.config/opencode"
OPENCODE_CUSTOM_CONFIG_DIR="${HOME_DIR}/.config/opencode-custom"
OPENCODE_DATA_DIR="${HOME_DIR}/.local/share/opencode"

# =============================================================================
# Fetch User Configuration from Management API
# =============================================================================
fetch_user_config() {
    if [ -z "$MANAGEMENT_API_URL" ] || [ -z "$USER_ID" ]; then
        echo "No MANAGEMENT_API_URL or USER_ID provided. Skipping remote config fetch."
        return 1
    fi
    
    echo "Fetching user configuration from Management API..."
    
    # Build the correct API endpoint URL
    CONFIG_URL="${MANAGEMENT_API_URL}/api/users/${USER_ID}/opencode/config"
    echo "  URL: $CONFIG_URL"
    
    # Build curl command with optional auth header
    CURL_OPTS="-sf --connect-timeout 10 --max-time 30"
    if [ -n "$AUTH_TOKEN" ]; then
        CURL_OPTS="$CURL_OPTS -H 'Authorization: Bearer ${AUTH_TOKEN}'"
    fi
    
    # Fetch config
    RESPONSE=$(eval curl $CURL_OPTS "'$CONFIG_URL'" 2>/dev/null) || {
        echo "  Warning: Failed to fetch config from Management API. Using defaults."
        return 1
    }
    
    # Validate JSON response
    if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
        echo "  Warning: Invalid JSON response from Management API. Using defaults."
        return 1
    fi
    
    echo "  Configuration fetched successfully."
    
    # Extract and write AGENTS.md (global instructions)
    # API returns 'agents_md' (snake_case)
    AGENTS_CONTENT=$(echo "$RESPONSE" | jq -r '.agents_md // empty')
    if [ -n "$AGENTS_CONTENT" ] && [ "$AGENTS_CONTENT" != "null" ]; then
        echo "  Writing AGENTS.md to $OPENCODE_CONFIG_DIR/AGENTS.md"
        mkdir -p "$OPENCODE_CONFIG_DIR"
        echo "$AGENTS_CONTENT" > "$OPENCODE_CONFIG_DIR/AGENTS.md"
    fi
    
    # Extract and write user settings to opencode.json
    SETTINGS=$(echo "$RESPONSE" | jq -r '.settings // {}')
    if [ "$SETTINGS" != "{}" ] && [ "$SETTINGS" != "null" ]; then
        echo "  Writing user settings to $OPENCODE_CONFIG_DIR/opencode.json"
        mkdir -p "$OPENCODE_CONFIG_DIR"
        echo "$SETTINGS" > "$OPENCODE_CONFIG_DIR/opencode.json"
    fi
    
    # Extract and write custom config files (agents, commands, tools, plugins)
    # API returns 'files' array with {type, name, extension, content}
    mkdir -p "$OPENCODE_CUSTOM_CONFIG_DIR"/{agent,command,tool,plugin}
    
    # Process each file type
    for FILE_TYPE in agent command tool plugin; do
        echo "$RESPONSE" | jq -c ".files[]? | select(.type==\"$FILE_TYPE\")" 2>/dev/null | while IFS= read -r file_json; do
            if [ -n "$file_json" ]; then
                NAME=$(echo "$file_json" | jq -r '.name // empty')
                EXT=$(echo "$file_json" | jq -r '.extension // "md"')
                CONTENT=$(echo "$file_json" | jq -r '.content // empty')
                
                if [ -n "$NAME" ] && [ -n "$CONTENT" ]; then
                    FILENAME="${NAME}.${EXT}"
                    echo "  Writing custom config: $OPENCODE_CUSTOM_CONFIG_DIR/$FILE_TYPE/$FILENAME"
                    echo "$CONTENT" > "$OPENCODE_CUSTOM_CONFIG_DIR/$FILE_TYPE/$FILENAME"
                fi
            fi
        done
    done
    
    # Set OPENCODE_CONFIG_DIR env var for OpenCode to find custom configs
    export OPENCODE_CONFIG_DIR="$OPENCODE_CUSTOM_CONFIG_DIR"
    
    return 0
}

# =============================================================================
# Fallback: Use Environment Variables for Configuration
# =============================================================================
setup_fallback_config() {
    echo "Setting up configuration from environment variables..."
    
    # Auth configuration (LLM provider credentials)
    if [ -n "$OPENCODE_AUTH_JSON" ]; then
        echo "  Writing auth.json from OPENCODE_AUTH_JSON"
        mkdir -p "$OPENCODE_DATA_DIR"
        echo "$OPENCODE_AUTH_JSON" > "$OPENCODE_DATA_DIR/auth.json"
    else
        echo "  No auth configuration provided. Starting with empty auth."
        mkdir -p "$OPENCODE_DATA_DIR"
        echo "{}" > "$OPENCODE_DATA_DIR/auth.json"
    fi
    
    # OpenCode project config
    if [ -n "$OPENCODE_CONFIG_JSON" ]; then
        echo "  Writing opencode.json from OPENCODE_CONFIG_JSON"
        mkdir -p "$WORKSPACE"
        echo "$OPENCODE_CONFIG_JSON" > "$WORKSPACE/opencode.json"
    else
        echo "  Creating default opencode.json with permissions"
        mkdir -p "$WORKSPACE"
        # Use OpenCode 1.0 format: 'permission' (singular) with 'allow'/'deny'/'ask' values
        cat > "$WORKSPACE/opencode.json" << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "allow",
    "bash": "allow",
    "webfetch": "allow",
    "external_directory": "allow"
  }
}
EOF
    fi
}

# =============================================================================
# Setup Auth from Environment
# =============================================================================
setup_auth() {
    # Always write auth.json from OPENCODE_AUTH_JSON if provided
    # This contains LLM provider credentials injected by the Management API
    if [ -n "$OPENCODE_AUTH_JSON" ]; then
        echo "  Writing auth.json from OPENCODE_AUTH_JSON"
        mkdir -p "$OPENCODE_DATA_DIR"
        echo "$OPENCODE_AUTH_JSON" > "$OPENCODE_DATA_DIR/auth.json"
    fi
}

# =============================================================================
# Clone Repository
# =============================================================================
clone_repository() {
    if [ -d "$WORKSPACE/.git" ]; then
        echo "Existing git repository found in workspace."
        echo "  Pulling latest changes..."
        cd "$WORKSPACE"
        git pull --ff-only 2>/dev/null || echo "  Note: Could not pull (may have local changes or be detached)"
        cd - > /dev/null
        return 0
    fi
    
    if [ -z "$FORGEJO_REPO_URL" ]; then
        echo "No repository URL provided. Starting with empty workspace."
        return 0
    fi
    
    # If workspace exists but is not a git repo, clean it up
    if [ -d "$WORKSPACE" ] && [ "$(ls -A $WORKSPACE 2>/dev/null)" ]; then
        echo "Workspace exists but is not a git repository. Cleaning up..."
        rm -rf "$WORKSPACE"
        mkdir -p "$WORKSPACE"
    fi
    
    echo "Cloning repository from Forgejo..."
    echo "  URL: $FORGEJO_REPO_URL"
    
    # Build clone URL with authentication if credentials provided
    if [ -n "$FORGEJO_USER" ] && [ -n "$FORGEJO_TOKEN" ]; then
        # Extract host from URL and inject credentials
        REPO_URL_WITH_AUTH=$(echo "$FORGEJO_REPO_URL" | sed "s|://|://${FORGEJO_USER}:${FORGEJO_TOKEN}@|")
        git clone "$REPO_URL_WITH_AUTH" "$WORKSPACE" 2>&1 || {
            echo "  Error: Failed to clone repository"
            return 1
        }
    else
        git clone "$FORGEJO_REPO_URL" "$WORKSPACE" 2>&1 || {
            echo "  Error: Failed to clone repository"
            return 1
        }
    fi
    
    echo "  Repository cloned successfully."
}

# =============================================================================
# Configure Git
# =============================================================================
configure_git() {
    echo "Configuring git..."
    git config --global user.email "${GIT_USER_EMAIL:-opencode@container.local}"
    git config --global user.name "${GIT_USER_NAME:-OpenCode}"
    git config --global --add safe.directory "$WORKSPACE"
    git config --global init.defaultBranch main
    
    # Configure credential helper to cache credentials for this session
    git config --global credential.helper 'cache --timeout=86400'
}

# =============================================================================
# Display Startup Information
# =============================================================================
show_startup_info() {
    echo ""
    echo "=============================================="
    echo "  Environment Ready"
    echo "=============================================="
    echo "  User:      developer"
    echo "  Workspace: $WORKSPACE"
    echo ""
    echo "  Services:"
    echo "    - OpenCode:    http://localhost:${OPENCODE_PORT:-4096}"
    echo "    - Code Server: http://localhost:${CODE_SERVER_PORT:-8080}"
    echo ""
    echo "  Tools installed:"
    echo "    - Node.js $(node --version 2>/dev/null || echo 'N/A')"
    echo "    - Python $(python --version 2>/dev/null | awk '{print $2}' || echo 'N/A')"
    echo "    - Go $(go version 2>/dev/null | awk '{print $3}' || echo 'N/A')"
    echo "    - Rust $(rustc --version 2>/dev/null | awk '{print $2}' || echo 'N/A')"
    echo "    - Git $(git --version 2>/dev/null | awk '{print $3}' || echo 'N/A')"
    echo "=============================================="
    echo ""
}

# =============================================================================
# Main Execution
# =============================================================================

# Ensure config directories exist (NOT workspace - it will be created by clone)
mkdir -p "$OPENCODE_CONFIG_DIR"
mkdir -p "$OPENCODE_CUSTOM_CONFIG_DIR"
mkdir -p "$OPENCODE_DATA_DIR"

# Clone repository first (this creates/manages the workspace)
clone_repository

# Ensure workspace exists (for empty project case)
mkdir -p "$WORKSPACE"

# Try to fetch config from Management API, fall back to env vars
fetch_user_config || setup_fallback_config

# Always setup auth from OPENCODE_AUTH_JSON (LLM credentials)
setup_auth

# Configure git
configure_git

# Show startup info
show_startup_info

# Change to workspace directory
cd "$WORKSPACE"

# Start code-server in background
# Note: code-server respects PORT env var, so we must override it explicitly
CODE_SERVER_PORT="${CODE_SERVER_PORT:-8080}"
CODE_SERVER_AUTH="${CODE_SERVER_AUTH:-none}"
echo "Starting code-server in background on port ${CODE_SERVER_PORT}..."
PORT="${CODE_SERVER_PORT}" code-server \
    --bind-addr "0.0.0.0:${CODE_SERVER_PORT}" \
    --auth "${CODE_SERVER_AUTH}" \
    --disable-telemetry \
    "$WORKSPACE" \
    > /tmp/code-server.log 2>&1 &

# Start OpenCode server in foreground (keeps container running)
echo "Starting OpenCode server..."
exec opencode serve --port "${OPENCODE_PORT:-4096}" --hostname "${OPENCODE_HOST:-0.0.0.0}"
