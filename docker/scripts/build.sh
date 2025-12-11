#!/bin/bash
# =============================================================================
# Build All CodeOpen Container Images
# =============================================================================
# Usage: ./build.sh [--no-cache] [--push] [--flavors <f1,f2>] [--addons <a1,a2>]
#
# Arguments:
#   --no-cache  - Build without Docker cache
#   --push      - Push to registry after build
#   --flavors   - Comma-separated list of flavors to build (default: all)
#   --addons    - Comma-separated list of addons to build (default: all)
#   --skip-base - Skip building base image
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Parse arguments
NO_CACHE=""
PUSH=""
BUILD_FLAVORS=""
BUILD_ADDONS=""
SKIP_BASE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --push)
            PUSH="--push"
            shift
            ;;
        --flavors)
            BUILD_FLAVORS="$2"
            shift 2
            ;;
        --addons)
            BUILD_ADDONS="$2"
            shift 2
            ;;
        --skip-base)
            SKIP_BASE="yes"
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Convert comma-separated lists to arrays
if [ -n "$BUILD_FLAVORS" ]; then
    IFS=',' read -ra SELECTED_FLAVORS <<< "$BUILD_FLAVORS"
else
    SELECTED_FLAVORS=("${FLAVORS[@]}")
fi

if [ -n "$BUILD_ADDONS" ]; then
    IFS=',' read -ra SELECTED_ADDONS <<< "$BUILD_ADDONS"
else
    SELECTED_ADDONS=("${ADDONS[@]}")
fi

echo "=============================================="
echo "  CodeOpen Container Build System"
echo "=============================================="
echo "  Version:  $CONTAINER_VERSION"
echo "  Registry: $REGISTRY_URL"
echo "  Platform: $BUILD_PLATFORM"
echo "  Cache:    ${NO_CACHE:-enabled}"
echo ""
echo "  Build Targets:"
echo "    Base:    ${SKIP_BASE:-yes}"
echo "    Flavors: ${SELECTED_FLAVORS[*]}"
echo "    Addons:  ${SELECTED_ADDONS[*]}"
echo "=============================================="
echo ""

# Track build status
BUILD_SUCCESS=0
BUILD_FAILED=0

# Build base image
if [ -z "$SKIP_BASE" ]; then
    echo "----------------------------------------"
    echo "  Building Base Image"
    echo "----------------------------------------"
    if "$SCRIPT_DIR/build-base.sh" $NO_CACHE $PUSH; then
        ((BUILD_SUCCESS++))
    else
        ((BUILD_FAILED++))
        echo "ERROR: Base image build failed!"
        exit 1
    fi
fi

# Build flavors
for flavor in "${SELECTED_FLAVORS[@]}"; do
    echo "----------------------------------------"
    echo "  Building Flavor: $flavor"
    echo "----------------------------------------"
    if "$SCRIPT_DIR/build-flavor.sh" "$flavor" $NO_CACHE $PUSH; then
        ((BUILD_SUCCESS++))
    else
        ((BUILD_FAILED++))
        echo "WARNING: Flavor '$flavor' build failed!"
    fi
done

# Build addons (using fullstack as base by default)
for addon in "${SELECTED_ADDONS[@]}"; do
    echo "----------------------------------------"
    echo "  Building Add-on: $addon"
    echo "----------------------------------------"
    if "$SCRIPT_DIR/build-addon.sh" "$addon" $NO_CACHE $PUSH; then
        ((BUILD_SUCCESS++))
    else
        ((BUILD_FAILED++))
        echo "WARNING: Add-on '$addon' build failed!"
    fi
done

echo ""
echo "=============================================="
echo "  Build Complete!"
echo "=============================================="
echo "  Successful: $BUILD_SUCCESS"
echo "  Failed:     $BUILD_FAILED"
echo "=============================================="
echo ""

if [ $BUILD_FAILED -gt 0 ]; then
    exit 1
fi
