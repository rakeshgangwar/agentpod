#!/bin/bash
# =============================================================================
# Build CodeOpen Flavor Image
# =============================================================================
# Usage: ./build-flavor.sh <flavor> [--no-cache] [--push] [--base <base-image>]
#
# Arguments:
#   flavor      - js, python, go, rust, fullstack, polyglot
#   --no-cache  - Build without Docker cache
#   --push      - Push to registry after build
#   --base      - Specify base image (default: codeopen-base:latest)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Parse arguments
FLAVOR=""
NO_CACHE=""
PUSH=""
CUSTOM_BASE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --push)
            PUSH="yes"
            shift
            ;;
        --base)
            CUSTOM_BASE="$2"
            shift 2
            ;;
        -*)
            echo "Unknown option: $1"
            exit 1
            ;;
        *)
            if [ -z "$FLAVOR" ]; then
                FLAVOR="$1"
            fi
            shift
            ;;
    esac
done

# Validate flavor
if [ -z "$FLAVOR" ]; then
    echo "Error: Flavor is required"
    echo "Usage: ./build-flavor.sh <flavor> [--no-cache] [--push] [--base <base-image>]"
    echo "Available flavors: ${FLAVORS[*]}"
    exit 1
fi

# Check if flavor exists
if [[ ! " ${FLAVORS[*]} " =~ " ${FLAVOR} " ]]; then
    echo "Error: Unknown flavor '$FLAVOR'"
    echo "Available flavors: ${FLAVORS[*]}"
    exit 1
fi

FLAVOR_DIR="$FLAVORS_DIR/$FLAVOR"
if [ ! -f "$FLAVOR_DIR/Dockerfile" ]; then
    echo "Error: Dockerfile not found for flavor '$FLAVOR'"
    exit 1
fi

# Determine base image (with or without registry prefix)
if [ -n "$CUSTOM_BASE" ]; then
    BASE_IMG="$CUSTOM_BASE"
elif [ -n "$CONTAINER_REGISTRY" ]; then
    BASE_IMG="${CONTAINER_REGISTRY}/codeopen-base:latest"
else
    BASE_IMG="codeopen-base:latest"
fi

# Determine flavor image name
if [ -n "$CONTAINER_REGISTRY" ]; then
    IMAGE_NAME="${CONTAINER_REGISTRY}/codeopen-${FLAVOR}"
    REGISTRY_DISPLAY="$CONTAINER_REGISTRY"
else
    IMAGE_NAME="codeopen-${FLAVOR}"
    REGISTRY_DISPLAY="local"
fi

echo "=============================================="
echo "  CodeOpen Flavor Build: $FLAVOR"
echo "=============================================="
echo "  Version:  $CONTAINER_VERSION"
echo "  Registry: $REGISTRY_DISPLAY"
echo "  Base:     $BASE_IMG"
echo "  Platform: $BUILD_PLATFORM"
echo "  Cache:    ${NO_CACHE:-enabled}"
echo "=============================================="
echo ""

echo "Building codeopen-${FLAVOR}..."

docker build $NO_CACHE \
    --platform "$BUILD_PLATFORM" \
    -t "$IMAGE_NAME:$CONTAINER_VERSION" \
    -t "$IMAGE_NAME:latest" \
    --build-arg BASE_IMAGE="$BASE_IMG" \
    --build-arg CONTAINER_VERSION="$CONTAINER_VERSION" \
    -f "$FLAVOR_DIR/Dockerfile" \
    "$FLAVOR_DIR"

echo ""
echo "Built: $IMAGE_NAME:$CONTAINER_VERSION"
echo "Built: $IMAGE_NAME:latest"
echo ""

if [ "$PUSH" = "yes" ]; then
    if [ -z "$CONTAINER_REGISTRY" ]; then
        echo "Warning: CONTAINER_REGISTRY not set, skipping push"
    else
        echo "Pushing images..."
        docker push "$IMAGE_NAME:$CONTAINER_VERSION"
        docker push "$IMAGE_NAME:latest"
        echo "Pushed successfully."
    fi
fi

echo ""
echo "=============================================="
echo "  Flavor Build Complete: $FLAVOR"
echo "=============================================="
