#!/bin/bash
# =============================================================================
# OpenCode Container Build Configuration
# =============================================================================
# This file is sourced by other scripts to provide default configuration.
# Override values by setting environment variables before running scripts.
# =============================================================================

# Registry configuration
export FORGEJO_REGISTRY="${FORGEJO_REGISTRY:-forgejo.superchotu.com}"
export FORGEJO_OWNER="${FORGEJO_OWNER:-rakeshgangwar}"

# Image names
export CLI_IMAGE="${FORGEJO_REGISTRY}/${FORGEJO_OWNER}/opencode-cli"
export DESKTOP_IMAGE="${FORGEJO_REGISTRY}/${FORGEJO_OWNER}/opencode-desktop"

# Get version from VERSION file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
export CONTAINER_VERSION=$(cat "$DOCKER_DIR/VERSION" 2>/dev/null || echo "0.0.1")
