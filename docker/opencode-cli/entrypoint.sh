#!/bin/bash
set -e

echo "=============================================="
echo "  OpenCode CLI Container v${CONTAINER_VERSION:-0.0.1}"
echo "=============================================="

# =============================================================================
# Environment Variables (expected)
# =============================================================================
# MANAGEMENT_API_URL    - URL of the Management API
# USER_ID               - User identifier for fetching config
# PROJECT_SLUG          - Project slug for workspace
# FORGEJO_REPO_URL      - Git repository URL
# FORGEJO_USER          - Git username for auth
# FORGEJO_TOKEN         - Git token for auth
# OPENCODE_AUTH_JSON    - Pre-built auth.json content (optional, fallback)
# OPENCODE_CONFIG_JSON  - Pre-built opencode.json content (optional, fallback)
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
    if [ -n "$MANAGEMENT_API_URL" ] && [ -n "$USER_ID" ]; then
        echo "Fetching user configuration from Management API..."
        
        CONFIG_URL="${MANAGEMENT_API_URL}/api/users/${USER_ID}/opencode-config"
        echo "  URL: $CONFIG_URL"
        
        # Fetch config with timeout
        RESPONSE=$(curl -sf --connect-timeout 10 --max-time 30 "$CONFIG_URL" 2>/dev/null) || {
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
        AGENTS_CONTENT=$(echo "$RESPONSE" | jq -r '.agentsMd // empty')
        if [ -n "$AGENTS_CONTENT" ] && [ "$AGENTS_CONTENT" != "null" ]; then
            echo "  Writing AGENTS.md to $OPENCODE_CONFIG_DIR/AGENTS.md"
            mkdir -p "$OPENCODE_CONFIG_DIR"
            echo "$AGENTS_CONTENT" > "$OPENCODE_CONFIG_DIR/AGENTS.md"
        fi
        
        # Extract and write custom config files (agents, commands, tools, plugins)
        mkdir -p "$OPENCODE_CUSTOM_CONFIG_DIR"
        
        # Write each config file type
        for FILE_TYPE in agents commands tools plugins; do
            FILES=$(echo "$RESPONSE" | jq -r ".configFiles.${FILE_TYPE} // [] | .[]" 2>/dev/null)
            if [ -n "$FILES" ]; then
                echo "$FILES" | while IFS= read -r file_json; do
                    FILENAME=$(echo "$file_json" | jq -r '.filename // empty')
                    CONTENT=$(echo "$file_json" | jq -r '.content // empty')
                    if [ -n "$FILENAME" ] && [ -n "$CONTENT" ]; then
                        echo "  Writing custom config: $OPENCODE_CUSTOM_CONFIG_DIR/$FILENAME"
                        echo "$CONTENT" > "$OPENCODE_CUSTOM_CONFIG_DIR/$FILENAME"
                    fi
                done
            fi
        done
        
        # Extract auth configuration
        AUTH_JSON=$(echo "$RESPONSE" | jq -r '.auth // empty')
        if [ -n "$AUTH_JSON" ] && [ "$AUTH_JSON" != "null" ] && [ "$AUTH_JSON" != "{}" ]; then
            echo "  Writing auth.json"
            mkdir -p "$OPENCODE_DATA_DIR"
            echo "$AUTH_JSON" > "$OPENCODE_DATA_DIR/auth.json"
        fi
        
        return 0
    else
        echo "No MANAGEMENT_API_URL or USER_ID provided. Skipping remote config fetch."
        return 1
    fi
}

# =============================================================================
# Fallback: Use Environment Variables for Configuration
# =============================================================================
setup_fallback_config() {
    echo "Setting up configuration from environment variables..."
    
    # Auth configuration
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
        echo "$OPENCODE_CONFIG_JSON" > "$WORKSPACE/opencode.json"
    else
        echo "  Creating default opencode.json with secure permissions"
        cat > "$WORKSPACE/opencode.json" << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "permissions": {
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
    fi
}

# =============================================================================
# Clone Repository
# =============================================================================
clone_repository() {
    if [ -d "$WORKSPACE/.git" ]; then
        echo "Existing git repository found in workspace."
        return 0
    fi
    
    if [ -z "$FORGEJO_REPO_URL" ]; then
        echo "No repository URL provided. Starting with empty workspace."
        return 0
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
    echo "  Port:      ${OPENCODE_PORT:-4096}"
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

# Ensure directories exist
mkdir -p "$WORKSPACE"
mkdir -p "$OPENCODE_CONFIG_DIR"
mkdir -p "$OPENCODE_CUSTOM_CONFIG_DIR"
mkdir -p "$OPENCODE_DATA_DIR"

# Try to fetch config from Management API, fall back to env vars
fetch_user_config || setup_fallback_config

# Clone repository if needed
clone_repository

# Configure git
configure_git

# Show startup info
show_startup_info

# Change to workspace directory
cd "$WORKSPACE"

# Start OpenCode server
echo "Starting OpenCode server..."
exec opencode serve --port "${OPENCODE_PORT:-4096}" --hostname "${OPENCODE_HOST:-0.0.0.0}"
