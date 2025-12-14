#!/bin/bash
# =============================================================================
# CodeOpen Modular Container Build Configuration
# =============================================================================
# This file is sourced by other scripts to provide default configuration.
# Override values by setting environment variables before running scripts.
# =============================================================================

# Registry configuration (optional - only needed for pushing to remote registry)
# Set CONTAINER_REGISTRY to push to a remote registry (e.g., ghcr.io/myorg)
# By default, images are built locally without a registry prefix
export CONTAINER_REGISTRY="${CONTAINER_REGISTRY:-}"

# Get version from VERSION file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
export CONTAINER_VERSION=$(cat "$DOCKER_DIR/VERSION" 2>/dev/null || echo "0.0.1")

# Directory structure
export BASE_DIR="$DOCKER_DIR/base"
export FLAVORS_DIR="$DOCKER_DIR/flavors"

# Base image (local by default)
if [ -n "$CONTAINER_REGISTRY" ]; then
    export BASE_IMAGE="${CONTAINER_REGISTRY}/codeopen-base:${CONTAINER_VERSION}"
else
    export BASE_IMAGE="codeopen-base:${CONTAINER_VERSION}"
fi

# Available flavors
export FLAVORS=("js" "python" "go" "rust" "fullstack" "polyglot")
export DEFAULT_FLAVOR="fullstack"

# Build platform
# Default to native platform for better performance (especially on Apple Silicon)
export BUILD_PLATFORM="${BUILD_PLATFORM:-linux/$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')}"

# Image naming convention: codeopen-{flavor}:{version}
# Returns local name by default, or registry-prefixed name if CONTAINER_REGISTRY is set
get_image_name() {
    local flavor="$1"
    if [ -n "$CONTAINER_REGISTRY" ]; then
        echo "${CONTAINER_REGISTRY}/codeopen-${flavor}"
    else
        echo "codeopen-${flavor}"
    fi
}

# Export function
export -f get_image_name
