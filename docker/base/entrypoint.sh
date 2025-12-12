#!/bin/bash
set -e

# Ensure PATH includes bun and other tool locations
export PATH="/usr/local/bun/bin:/usr/local/bin:$PATH"

echo "=============================================="
echo "  AgentPod Container v${CONTAINER_VERSION:-0.4.0}"
echo "=============================================="

# =============================================================================
# Environment Variables (expected)
# =============================================================================
# MANAGEMENT_API_URL    - URL of the Management API
# AUTH_TOKEN            - Bearer token for Management API authentication
# USER_ID               - User identifier for fetching config
# PROJECT_NAME          - Project display name
# PROJECT_SLUG          - Project slug for URLs
# SANDBOX_ID            - Unique sandbox identifier
#
# Git Repository Options (choose one):
#   Option 1: Pre-mounted workspace (new architecture)
#     - Workspace is mounted as a volume at /home/developer/workspace
#     - No cloning needed, repository is already there
#
#   Option 2: Clone from remote (legacy, still supported)
#     GIT_REPO_URL        - Git repository URL to clone
#     GIT_USERNAME        - Git username for authentication
#     GIT_TOKEN           - Git token for authentication
#     GIT_BRANCH          - Branch to checkout (default: main)
#
# OpenCode Configuration:
#   OPENCODE_AUTH_JSON    - Pre-built auth.json content (for LLM providers)
#                           Written to ~/.local/share/opencode/auth.json
#   OPENCODE_USER_CONFIG  - User's global config JSON (settings, custom files)
#                           Written to ~/.config/opencode/
#   CODEOPEN_FLAVOR       - Container flavor (js, python, go, rust, fullstack, polyglot)
#                           Used for flavor-specific AGENTS.md in workspace
#   OPENCODE_PORT         - Port for OpenCode server (default: 4096)
#   OPENCODE_HOST         - Host for OpenCode server (default: 0.0.0.0)
#
# Other:
#   ACP_GATEWAY_PORT      - Port for ACP Gateway (default: 4097)
#   ADDON_IDS             - Comma-separated list of addon IDs to enable
#   WILDCARD_DOMAIN       - Domain for URL generation (default: localhost)
# =============================================================================

HOME_DIR="/home/developer"
WORKSPACE="${HOME_DIR}/workspace"
OPENCODE_CONFIG_DIR="${HOME_DIR}/.config/opencode"
OPENCODE_DATA_DIR="${HOME_DIR}/.local/share/opencode"

# Source common functions if available
if [ -f /opt/agentpod/scripts/common-setup.sh ]; then
    source /opt/agentpod/scripts/common-setup.sh
fi

# =============================================================================
# Fetch User Configuration from Management API
# =============================================================================
# Fetches global config from Management API and writes to:
#   - ~/.config/opencode/opencode.json (settings)
#   - ~/.config/opencode/{agent,command,tool,plugin}/ (custom files)
# Note: AGENTS.md from API is no longer used - project AGENTS.md is flavor-specific
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
    
    # Global config directory
    GLOBAL_CONFIG_DIR="$OPENCODE_CONFIG_DIR"
    mkdir -p "$GLOBAL_CONFIG_DIR"
    
    # Extract and write user settings to global opencode.json
    SETTINGS=$(echo "$RESPONSE" | jq -r '.settings // {}')
    if [ "$SETTINGS" != "{}" ] && [ "$SETTINGS" != "null" ]; then
        echo "  Writing user settings to $GLOBAL_CONFIG_DIR/opencode.json"
        echo "$SETTINGS" > "$GLOBAL_CONFIG_DIR/opencode.json"
    fi
    
    # Extract and write custom config files to global directory
    mkdir -p "$GLOBAL_CONFIG_DIR"/{agent,command,tool,plugin}
    
    for FILE_TYPE in agent command tool plugin; do
        echo "$RESPONSE" | jq -c ".files[]? | select(.type==\"$FILE_TYPE\")" 2>/dev/null | while IFS= read -r file_json; do
            if [ -n "$file_json" ]; then
                NAME=$(echo "$file_json" | jq -r '.name // empty')
                EXT=$(echo "$file_json" | jq -r '.extension // "md"')
                CONTENT=$(echo "$file_json" | jq -r '.content // empty')
                
                if [ -n "$NAME" ] && [ -n "$CONTENT" ]; then
                    FILENAME="${NAME}.${EXT}"
                    echo "  Writing global config: $GLOBAL_CONFIG_DIR/$FILE_TYPE/$FILENAME"
                    echo "$CONTENT" > "$GLOBAL_CONFIG_DIR/$FILE_TYPE/$FILENAME"
                fi
            fi
        done
    done
    
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
    if [ -n "$OPENCODE_AUTH_JSON" ]; then
        echo "  Writing auth.json from OPENCODE_AUTH_JSON"
        mkdir -p "$OPENCODE_DATA_DIR"
        echo "$OPENCODE_AUTH_JSON" > "$OPENCODE_DATA_DIR/auth.json"
    fi
}

# =============================================================================
# Setup User Config from Environment
# =============================================================================
# Parses OPENCODE_USER_CONFIG JSON and sets up GLOBAL config:
#   - settings -> ~/.config/opencode/opencode.json
#   - agents_md (global instructions) -> ~/.config/opencode/AGENTS.md
#   - files (agent/, command/, tool/, plugin/) -> ~/.config/opencode/
# =============================================================================
setup_user_config() {
    if [ -z "$OPENCODE_USER_CONFIG" ]; then
        return 0
    fi
    
    echo "Setting up user OpenCode configuration from OPENCODE_USER_CONFIG..."
    
    # Validate JSON
    if ! echo "$OPENCODE_USER_CONFIG" | jq empty 2>/dev/null; then
        echo "  Warning: Invalid JSON in OPENCODE_USER_CONFIG. Skipping."
        return 1
    fi
    
    # Global config directory: ~/.config/opencode/
    GLOBAL_CONFIG_DIR="$OPENCODE_CONFIG_DIR"
    mkdir -p "$GLOBAL_CONFIG_DIR"
    
    # Extract and write global settings to ~/.config/opencode/opencode.json
    SETTINGS=$(echo "$OPENCODE_USER_CONFIG" | jq -r '.settings // {}')
    if [ "$SETTINGS" != "{}" ] && [ "$SETTINGS" != "null" ]; then
        echo "  Writing global settings to $GLOBAL_CONFIG_DIR/opencode.json"
        echo "$SETTINGS" > "$GLOBAL_CONFIG_DIR/opencode.json"
    fi
    
    # Extract and write global instructions (agents_md) to ~/.config/opencode/AGENTS.md
    # This is the user's global instructions that apply to all projects
    AGENTS_MD=$(echo "$OPENCODE_USER_CONFIG" | jq -r '.agents_md // empty')
    if [ -n "$AGENTS_MD" ] && [ "$AGENTS_MD" != "null" ]; then
        echo "  Writing global instructions to $GLOBAL_CONFIG_DIR/AGENTS.md"
        echo "$AGENTS_MD" > "$GLOBAL_CONFIG_DIR/AGENTS.md"
    fi
    
    # Extract and write custom config files to global directory
    # These go in ~/.config/opencode/{agent,command,tool,plugin}/
    mkdir -p "$GLOBAL_CONFIG_DIR"/{agent,command,tool,plugin}
    
    for FILE_TYPE in agent command tool plugin; do
        echo "$OPENCODE_USER_CONFIG" | jq -c ".files[]? | select(.type==\"$FILE_TYPE\")" 2>/dev/null | while IFS= read -r file_json; do
            if [ -n "$file_json" ]; then
                NAME=$(echo "$file_json" | jq -r '.name // empty')
                EXT=$(echo "$file_json" | jq -r '.extension // "md"')
                CONTENT=$(echo "$file_json" | jq -r '.content // empty')
                
                if [ -n "$NAME" ] && [ -n "$CONTENT" ]; then
                    FILENAME="${NAME}.${EXT}"
                    echo "  Writing global config: $GLOBAL_CONFIG_DIR/$FILE_TYPE/$FILENAME"
                    echo "$CONTENT" > "$GLOBAL_CONFIG_DIR/$FILE_TYPE/$FILENAME"
                fi
            fi
        done
    done
    
    echo "  User global configuration setup complete."
    return 0
}

# =============================================================================
# Setup Project Config
# =============================================================================
# Sets up project-level configuration in the workspace:
#   - opencode.json (with permissions)
#   - AGENTS.md (flavor-specific instructions)
# =============================================================================
setup_project_config() {
    echo "Setting up project-level OpenCode configuration..."
    
    # Ensure workspace exists
    mkdir -p "$WORKSPACE"
    
    # Get flavor from environment (set by container)
    FLAVOR="${CODEOPEN_FLAVOR:-fullstack}"
    
    # Create project opencode.json if it doesn't exist
    if [ ! -f "$WORKSPACE/opencode.json" ]; then
        echo "  Creating project opencode.json with default permissions"
        cat > "$WORKSPACE/opencode.json" << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "allow",
    "bash": "allow",
    "write": "allow",
    "webfetch": "allow",
    "mcp": "allow",
    "external_directory": "allow"
  }
}
EOF
    fi
    
    # Create flavor-specific AGENTS.md if it doesn't exist
    if [ ! -f "$WORKSPACE/AGENTS.md" ]; then
        echo "  Creating AGENTS.md for flavor: $FLAVOR"
        case "$FLAVOR" in
            js)
                cat > "$WORKSPACE/AGENTS.md" << 'EOF'
# Project Instructions

## Environment
This is a JavaScript/TypeScript development environment with:
- Node.js 22 LTS
- Bun runtime
- TypeScript, tsx, ts-node
- Yarn, pnpm package managers
- Deno runtime
- ESLint, Prettier, Biome

## Code Style
- Use TypeScript for type safety
- Prefer ES modules over CommonJS
- Use async/await over callbacks
- Follow project's existing code style
EOF
                ;;
            python)
                cat > "$WORKSPACE/AGENTS.md" << 'EOF'
# Project Instructions

## Environment
This is a Python development environment with:
- Python 3.12+
- pip, pipx, uv package managers
- Poetry for dependency management
- pytest for testing
- Black, Ruff for formatting/linting
- pyright for type checking

## Code Style
- Use type hints for function signatures
- Follow PEP 8 style guidelines
- Use virtual environments for dependencies
- Prefer pathlib over os.path
EOF
                ;;
            go)
                cat > "$WORKSPACE/AGENTS.md" << 'EOF'
# Project Instructions

## Environment
This is a Go development environment with:
- Go 1.22+
- Standard Go toolchain (go build, go test, go mod)
- golangci-lint for linting
- delve for debugging

## Code Style
- Follow Effective Go guidelines
- Use gofmt for formatting
- Handle errors explicitly
- Keep packages small and focused
EOF
                ;;
            rust)
                cat > "$WORKSPACE/AGENTS.md" << 'EOF'
# Project Instructions

## Environment
This is a Rust development environment with:
- Rust stable toolchain
- Cargo package manager
- rustfmt for formatting
- clippy for linting
- rust-analyzer for IDE support

## Code Style
- Follow Rust API guidelines
- Use rustfmt for formatting
- Handle Results and Options properly
- Prefer references over cloning
EOF
                ;;
            fullstack)
                cat > "$WORKSPACE/AGENTS.md" << 'EOF'
# Project Instructions

## Environment
This is a full-stack development environment with:
- Node.js 22 LTS, Bun, Deno
- Python 3.12+ with pip, poetry
- Go 1.22+ with standard toolchain
- Common CLI tools and utilities

## Code Style
- Follow the conventions of the primary language being used
- Use appropriate linters and formatters for each language
- Write tests alongside implementation code
EOF
                ;;
            polyglot)
                cat > "$WORKSPACE/AGENTS.md" << 'EOF'
# Project Instructions

## Environment
This is a polyglot development environment with:
- Node.js 22, Bun, Deno (JavaScript/TypeScript)
- Python 3.12+ (Python)
- Go 1.22+ (Go)
- Rust stable (Rust)
- All standard tools for each language

## Code Style
- Follow the conventions of the language being used
- Use appropriate linters and formatters
- Maintain consistency within each language's codebase
EOF
                ;;
            *)
                cat > "$WORKSPACE/AGENTS.md" << 'EOF'
# Project Instructions

## Environment
This is a CodeOpen development environment.

## Code Style
- Follow the project's existing code conventions
- Use appropriate tools for the language being used
EOF
                ;;
        esac
    fi
    
    echo "  Project configuration setup complete."
}

# =============================================================================
# Initialize Workspace
# =============================================================================
# New architecture: workspace is pre-mounted as a volume
# Legacy support: can still clone from a remote Git URL
# =============================================================================
initialize_workspace() {
    # Check if workspace already has content (pre-mounted volume)
    if [ -d "$WORKSPACE" ] && [ "$(ls -A $WORKSPACE 2>/dev/null)" ]; then
        echo "Workspace is pre-mounted with content."
        
        # Check if it's a git repository
        if [ -d "$WORKSPACE/.git" ]; then
            echo "  Git repository detected."
            cd "$WORKSPACE"
            # Show current branch and status
            BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
            echo "  Branch: $BRANCH"
            cd - > /dev/null
        else
            echo "  Not a git repository. Initializing git..."
            cd "$WORKSPACE"
            git init
            git add -A
            git commit -m "Initial commit" --allow-empty 2>/dev/null || true
            cd - > /dev/null
        fi
        return 0
    fi
    
    # Legacy: Clone from remote repository if URL is provided
    if [ -n "$GIT_REPO_URL" ]; then
        echo "Cloning repository from remote..."
        echo "  URL: $GIT_REPO_URL"
        
        # Ensure workspace directory exists
        mkdir -p "$WORKSPACE"
        
        # Build clone URL with authentication if provided
        if [ -n "$GIT_USERNAME" ] && [ -n "$GIT_TOKEN" ]; then
            REPO_URL_WITH_AUTH=$(echo "$GIT_REPO_URL" | sed "s|://|://${GIT_USERNAME}:${GIT_TOKEN}@|")
            CLONE_URL="$REPO_URL_WITH_AUTH"
        else
            CLONE_URL="$GIT_REPO_URL"
        fi
        
        # Clone the repository
        BRANCH="${GIT_BRANCH:-main}"
        git clone --branch "$BRANCH" "$CLONE_URL" "$WORKSPACE" 2>&1 || {
            echo "  Warning: Failed to clone branch '$BRANCH', trying default branch..."
            git clone "$CLONE_URL" "$WORKSPACE" 2>&1 || {
                echo "  Error: Failed to clone repository"
                return 1
            }
        }
        
        echo "  Repository cloned successfully."
        return 0
    fi
    
    # Fallback for legacy FORGEJO_* variables (deprecated but still supported)
    if [ -n "$FORGEJO_REPO_URL" ]; then
        echo "Warning: FORGEJO_* variables are deprecated. Use GIT_REPO_URL instead."
        export GIT_REPO_URL="$FORGEJO_REPO_URL"
        export GIT_USERNAME="${FORGEJO_USER:-}"
        export GIT_TOKEN="${FORGEJO_TOKEN:-}"
        initialize_workspace
        return $?
    fi
    
    # No repository configured - start with empty workspace
    echo "No repository URL provided. Starting with empty workspace."
    mkdir -p "$WORKSPACE"
    cd "$WORKSPACE"
    git init
    echo "# New Project" > README.md
    git add README.md
    git commit -m "Initial commit" 2>/dev/null || true
    cd - > /dev/null
    return 0
}

# =============================================================================
# Configure Git
# =============================================================================
configure_git() {
    echo "Configuring git..."
    git config --global user.email "${GIT_USER_EMAIL:-developer@agentpod.dev}"
    git config --global user.name "${GIT_USER_NAME:-AgentPod Developer}"
    git config --global --add safe.directory "$WORKSPACE"
    git config --global init.defaultBranch main
    git config --global credential.helper 'cache --timeout=86400'
    
    # Configure git to use the token for the repository host if provided
    if [ -n "$GIT_TOKEN" ] && [ -n "$GIT_REPO_URL" ]; then
        # Extract host from URL
        GIT_HOST=$(echo "$GIT_REPO_URL" | sed -E 's|^https?://([^/]+).*|\1|')
        if [ -n "$GIT_HOST" ]; then
            git config --global credential.helper "store"
            echo "https://${GIT_USERNAME:-git}:${GIT_TOKEN}@${GIT_HOST}" >> ~/.git-credentials
        fi
    fi
}

# =============================================================================
# Install Addons
# =============================================================================
install_addons() {
    if [ -z "$ADDON_IDS" ]; then
        echo "No addons to install."
        return 0
    fi
    
    echo "Installing addons: $ADDON_IDS"
    
    # Split comma-separated list
    IFS=',' read -ra ADDONS <<< "$ADDON_IDS"
    
    for addon in "${ADDONS[@]}"; do
        addon=$(echo "$addon" | xargs)  # Trim whitespace
        echo "  Installing addon: $addon"
        
        case "$addon" in
            code-server)
                echo "    Installing code-server..."
                curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=standalone --prefix=/usr/local 2>/dev/null || {
                    echo "    Warning: Failed to install code-server"
                    continue
                }
                mkdir -p ~/.config/code-server
                cat > ~/.config/code-server/config.yaml << 'EOF'
bind-addr: 0.0.0.0:8080
auth: none
cert: false
EOF
                echo "    code-server installed successfully"
                ;;
                
            gui)
                echo "    GUI addon requires pre-built image layer (not runtime installation)"
                ;;
                
            databases)
                echo "    Installing database clients..."
                sudo apt-get update -qq && sudo apt-get install -y -qq --no-install-recommends \
                    postgresql-client redis-tools sqlite3 2>/dev/null || {
                    echo "    Warning: Failed to install database clients"
                    continue
                }
                echo "    Database clients installed successfully"
                ;;
                
            cloud)
                echo "    Cloud CLI addon requires pre-built image layer (not runtime installation)"
                ;;
                
            gpu)
                echo "    GPU addon - no installation required (uses NVIDIA runtime)"
                ;;
                
            *)
                echo "    Unknown addon: $addon"
                ;;
        esac
    done
    
    echo "Addon installation complete."
}

# =============================================================================
# Start Homepage Service
# =============================================================================
start_homepage() {
    echo "Starting Homepage service on port ${HOMEPAGE_PORT:-3000}..."
    cd /opt/homepage
    
    # Export environment for homepage
    export PROJECT_NAME="${PROJECT_NAME:-AgentPod Project}"
    export PROJECT_SLUG="${PROJECT_SLUG:-project}"
    export SANDBOX_ID="${SANDBOX_ID:-}"
    export WILDCARD_DOMAIN="${WILDCARD_DOMAIN:-localhost}"
    
    bun run src/index.ts &
    HOMEPAGE_PID=$!
    cd "$WORKSPACE"
    
    # Wait for Homepage to be ready
    for i in {1..15}; do
        if curl -sf "http://localhost:${HOMEPAGE_PORT:-3000}/health" > /dev/null 2>&1; then
            echo "  Homepage is ready."
            return 0
        fi
        sleep 1
    done
    
    echo "  Warning: Homepage health check timed out."
    return 0
}

# =============================================================================
# Start nginx
# =============================================================================
start_nginx() {
    echo "Starting nginx on port ${NGINX_PORT:-80}..."
    
    # nginx needs to run as root to bind to port 80
    sudo nginx -g 'daemon off;' &
    NGINX_PID=$!
    
    # Wait for nginx to be ready
    for i in {1..15}; do
        if curl -sf "http://localhost:${NGINX_PORT:-80}/health" > /dev/null 2>&1; then
            echo "  nginx is ready."
            return 0
        fi
        sleep 1
    done
    
    echo "  Warning: nginx health check timed out."
    return 0
}

# =============================================================================
# Start Addon Services (Code Server on port 8080 for hybrid mode)
# =============================================================================
start_addon_services() {
    if [ -z "$ADDON_IDS" ]; then
        return 0
    fi
    
    IFS=',' read -ra ADDONS <<< "$ADDON_IDS"
    
    for addon in "${ADDONS[@]}"; do
        addon=$(echo "$addon" | xargs)
        
        case "$addon" in
            code-server)
                if command -v code-server &> /dev/null; then
                    echo "Starting code-server on port 8080 (hybrid mode - separate subdomain)..."
                    # Override PORT env var and explicitly pass bind-addr to ensure port 8080
                    # code-server respects PORT env var which may conflict with OPENCODE_PORT
                    PORT=8080 code-server --bind-addr 0.0.0.0:8080 --auth none --disable-telemetry &
                    CODE_SERVER_PID=$!
                fi
                ;;
        esac
    done
}

# =============================================================================
# Start OpenCode Server
# =============================================================================
start_opencode_server() {
    echo "Starting OpenCode server on port ${OPENCODE_PORT:-4096}..."
    cd "$WORKSPACE"
    opencode serve --port "${OPENCODE_PORT:-4096}" --hostname "${OPENCODE_HOST:-0.0.0.0}" &
    OPENCODE_PID=$!
    
    # Wait for OpenCode to be ready
    echo "Waiting for OpenCode server to start..."
    for i in {1..30}; do
        if curl -sf "http://localhost:${OPENCODE_PORT:-4096}/session" > /dev/null 2>&1; then
            echo "  OpenCode server is ready."
            return 0
        fi
        sleep 1
    done
    
    echo "  Warning: OpenCode server health check timed out."
    return 0
}

# =============================================================================
# Start ACP Gateway
# =============================================================================
start_acp_gateway() {
    echo "Starting ACP Gateway on port ${ACP_GATEWAY_PORT:-4097}..."
    cd /opt/acp-gateway
    bun run src/index.ts &
    ACP_PID=$!
    cd "$WORKSPACE"
    
    # Wait for ACP Gateway to be ready
    echo "Waiting for ACP Gateway to start..."
    for i in {1..30}; do
        if curl -sf "http://localhost:${ACP_GATEWAY_PORT:-4097}/health" > /dev/null 2>&1; then
            echo "  ACP Gateway is ready."
            return 0
        fi
        sleep 1
    done
    
    echo "  Warning: ACP Gateway health check timed out."
    return 0
}

# =============================================================================
# Display Startup Information
# =============================================================================
show_startup_info() {
    local DOMAIN="${WILDCARD_DOMAIN:-localhost}"
    local PROTOCOL="http"
    
    # Use HTTPS for non-localhost domains
    if [ "$DOMAIN" != "localhost" ]; then
        PROTOCOL="https"
    fi
    
    local BASE_URL="${PROTOCOL}://${PROJECT_SLUG:-project}.${DOMAIN}"
    local CODE_URL="${PROTOCOL}://code-${PROJECT_SLUG:-project}.${DOMAIN}"
    
    echo ""
    echo "=============================================="
    echo "  Environment Ready"
    echo "=============================================="
    echo "  Project:   ${PROJECT_NAME:-AgentPod Project}"
    echo "  Sandbox:   ${SANDBOX_ID:-not set}"
    echo "  User:      developer"
    echo "  Workspace: $WORKSPACE"
    echo ""
    echo "  URLs:"
    echo "    - Homepage:    $BASE_URL/"
    echo "    - OpenCode:    $BASE_URL/opencode/"
    echo "    - ACP Gateway: $BASE_URL/acp/"
    echo "    - Code Server: $BASE_URL/code/"
    echo "    - VNC Desktop: $BASE_URL/vnc/"
    if [ -n "$CODE_SERVER_PID" ]; then
        echo "    - Code Server (direct): $CODE_URL/"
    fi
    echo ""
    echo "  Internal Services:"
    echo "    - nginx:       http://localhost:${NGINX_PORT:-80}"
    echo "    - Homepage:    http://localhost:${HOMEPAGE_PORT:-3000}"
    echo "    - OpenCode:    http://localhost:${OPENCODE_PORT:-4096}"
    echo "    - ACP Gateway: http://localhost:${ACP_GATEWAY_PORT:-4097}"
    echo ""
    echo "  Tools installed:"
    echo "    - Node.js $(node --version 2>/dev/null || echo 'N/A')"
    echo "    - Bun $(bun --version 2>/dev/null || echo 'N/A')"
    echo "    - Git $(git --version 2>/dev/null | awk '{print $3}' || echo 'N/A')"
    echo "=============================================="
    echo ""
}

# =============================================================================
# Handle shutdown gracefully
# =============================================================================
cleanup() {
    echo "Shutting down..."
    [ -n "$NGINX_PID" ] && sudo kill "$NGINX_PID" 2>/dev/null || true
    [ -n "$HOMEPAGE_PID" ] && kill "$HOMEPAGE_PID" 2>/dev/null || true
    [ -n "$CODE_SERVER_PID" ] && kill "$CODE_SERVER_PID" 2>/dev/null || true
    [ -n "$OPENCODE_PID" ] && kill "$OPENCODE_PID" 2>/dev/null || true
    [ -n "$ACP_PID" ] && kill "$ACP_PID" 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT

# =============================================================================
# Main Execution
# =============================================================================

# Ensure config directories exist
mkdir -p "$OPENCODE_CONFIG_DIR"
mkdir -p "$OPENCODE_DATA_DIR"

# Configure git first (needed for workspace initialization)
configure_git

# Initialize workspace (handles both pre-mounted and remote clone)
initialize_workspace

# Ensure workspace exists
mkdir -p "$WORKSPACE"

# Try to fetch config from Management API, fall back to env vars
fetch_user_config || setup_fallback_config

# Always setup auth from OPENCODE_AUTH_JSON (provider credentials)
setup_auth

# Setup user config from OPENCODE_USER_CONFIG (global settings, custom files)
setup_user_config

# Setup project-level config (opencode.json, flavor-specific AGENTS.md)
setup_project_config

# Install addons (based on ADDON_IDS env var)
install_addons

# Show startup info early
show_startup_info

# Change to workspace directory
cd "$WORKSPACE"

# =============================================================================
# Start services in order:
# 1. Internal services first (OpenCode, ACP Gateway, Homepage)
# 2. nginx (main entry point - simple reverse proxy)
# 3. Addon services (code-server on port 8080)
# =============================================================================

echo "Starting internal services..."

# Start OpenCode server (port 4096)
start_opencode_server

# Start ACP Gateway (port 4097)
start_acp_gateway

# Start Homepage (port 3000)
start_homepage

# Start nginx (port 80 - main entry point)
start_nginx

# Start addon services (e.g., code-server on port 8080)
start_addon_services

# =============================================================================
# Keep container running
# =============================================================================
echo ""
echo "All services started. Container is ready."
echo "  Main entry point: http://localhost:${NGINX_PORT:-80}"
echo ""

# Wait for nginx to exit (main process)
wait $NGINX_PID 2>/dev/null || wait
