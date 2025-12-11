#!/bin/bash
# =============================================================================
# CodeOpen Modular Container Build Configuration
# =============================================================================
# This file is sourced by other scripts to provide default configuration.
# Override values by setting environment variables before running scripts.
# =============================================================================

# Registry configuration
export FORGEJO_REGISTRY="${FORGEJO_REGISTRY:-forgejo.superchotu.com}"
export FORGEJO_OWNER="${FORGEJO_OWNER:-rakeshgangwar}"
export REGISTRY_URL="${FORGEJO_REGISTRY}/${FORGEJO_OWNER}"

# Get version from VERSION file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
export CONTAINER_VERSION=$(cat "$DOCKER_DIR/VERSION" 2>/dev/null || echo "0.0.1")

# Directory structure
export BASE_DIR="$DOCKER_DIR/base"
export FLAVORS_DIR="$DOCKER_DIR/flavors"
export ADDONS_DIR="$DOCKER_DIR/addons"

# Base image
export BASE_IMAGE="${REGISTRY_URL}/codeopen-base:${CONTAINER_VERSION}"

# Available flavors
export FLAVORS=("js" "python" "go" "rust" "fullstack" "polyglot")
export DEFAULT_FLAVOR="fullstack"

# Available addons
export ADDONS=("gui" "code-server" "gpu" "databases" "cloud")

# Build platform
export BUILD_PLATFORM="${BUILD_PLATFORM:-linux/amd64}"

# Image naming convention: codeopen-{flavor}[-addon1][-addon2]:{version}
get_image_name() {
    local flavor="$1"
    shift
    local addons=("$@")
    
    local name="codeopen-${flavor}"
    for addon in "${addons[@]}"; do
        name="${name}-${addon}"
    done
    
    echo "${REGISTRY_URL}/${name}"
}

# Export function
export -f get_image_name
