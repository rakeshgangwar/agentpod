#!/bin/bash
# =============================================================================
# Fetch User Configuration from Management API
# This script can be called independently to refresh configuration
# =============================================================================

set -e

HOME_DIR="/home/developer"
OPENCODE_CONFIG_DIR="${HOME_DIR}/.config/opencode"
OPENCODE_CUSTOM_CONFIG_DIR="${HOME_DIR}/.config/opencode-custom"
OPENCODE_DATA_DIR="${HOME_DIR}/.local/share/opencode"

if [ -z "$MANAGEMENT_API_URL" ] || [ -z "$USER_ID" ]; then
    echo "Error: MANAGEMENT_API_URL and USER_ID must be set"
    exit 1
fi

CONFIG_URL="${MANAGEMENT_API_URL}/api/users/${USER_ID}/opencode-config"
echo "Fetching configuration from: $CONFIG_URL"

RESPONSE=$(curl -sf --connect-timeout 10 --max-time 30 "$CONFIG_URL") || {
    echo "Error: Failed to fetch configuration"
    exit 1
}

# Validate JSON
if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
    echo "Error: Invalid JSON response"
    exit 1
fi

echo "Configuration fetched successfully."

# Extract and write AGENTS.md
AGENTS_CONTENT=$(echo "$RESPONSE" | jq -r '.agentsMd // empty')
if [ -n "$AGENTS_CONTENT" ] && [ "$AGENTS_CONTENT" != "null" ]; then
    mkdir -p "$OPENCODE_CONFIG_DIR"
    echo "$AGENTS_CONTENT" > "$OPENCODE_CONFIG_DIR/AGENTS.md"
    echo "  Written: $OPENCODE_CONFIG_DIR/AGENTS.md"
fi

# Extract and write custom config files
mkdir -p "$OPENCODE_CUSTOM_CONFIG_DIR"

for FILE_TYPE in agents commands tools plugins; do
    echo "$RESPONSE" | jq -c ".configFiles.${FILE_TYPE}[]?" 2>/dev/null | while IFS= read -r file_json; do
        FILENAME=$(echo "$file_json" | jq -r '.filename // empty')
        CONTENT=$(echo "$file_json" | jq -r '.content // empty')
        if [ -n "$FILENAME" ] && [ -n "$CONTENT" ]; then
            echo "$CONTENT" > "$OPENCODE_CUSTOM_CONFIG_DIR/$FILENAME"
            echo "  Written: $OPENCODE_CUSTOM_CONFIG_DIR/$FILENAME"
        fi
    done
done

# Extract and write auth configuration
AUTH_JSON=$(echo "$RESPONSE" | jq -r '.auth // empty')
if [ -n "$AUTH_JSON" ] && [ "$AUTH_JSON" != "null" ] && [ "$AUTH_JSON" != "{}" ]; then
    mkdir -p "$OPENCODE_DATA_DIR"
    echo "$AUTH_JSON" > "$OPENCODE_DATA_DIR/auth.json"
    echo "  Written: $OPENCODE_DATA_DIR/auth.json"
fi

echo "Configuration update complete."
