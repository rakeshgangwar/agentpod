#!/bin/bash
# =============================================================================
# Build All AgentPod Container Images for Local Development
# =============================================================================
# Usage: ./build-dev.sh [--no-cache] [--flavors <f1,f2>] [--skip-base]
#
# This script builds all images with :dev tags for local development.
# Unlike build.sh, this doesn't require registry configuration.
#
# Arguments:
#   --no-cache   - Build without Docker cache
#   --flavors    - Comma-separated list of flavors to build (default: all)
#   --skip-base  - Skip building base image (use existing agentpod-base:dev)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"

# Available flavors
ALL_FLAVORS="js python go rust fullstack polyglot"

# Parse arguments
NO_CACHE=""
SKIP_BASE=""
BUILD_FLAVORS=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --skip-base)
            SKIP_BASE="yes"
            shift
            ;;
        --flavors)
            BUILD_FLAVORS="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--no-cache] [--flavors <f1,f2>] [--skip-base]"
            echo ""
            echo "Options:"
            echo "  --no-cache   Build without Docker cache"
            echo "  --flavors    Comma-separated list of flavors (default: all)"
            echo "               Available: $ALL_FLAVORS"
            echo "  --skip-base  Skip building base image"
            echo ""
            echo "Examples:"
            echo "  $0                        # Build everything"
            echo "  $0 --flavors js,python    # Build only js and python flavors"
            echo "  $0 --skip-base --flavors js  # Rebuild only js flavor"
            echo "  $0 --no-cache             # Fresh build without cache"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Determine which flavors to build
if [ -n "$BUILD_FLAVORS" ]; then
    # Convert comma-separated to space-separated
    SELECTED_FLAVORS=$(echo "$BUILD_FLAVORS" | tr ',' ' ')
else
    SELECTED_FLAVORS="$ALL_FLAVORS"
fi

echo ""
echo "=============================================="
echo "  AgentPod Dev Build"
echo "=============================================="
echo "  Base:    ${SKIP_BASE:-will build}"
echo "  Flavors: $SELECTED_FLAVORS"
echo "  Cache:   ${NO_CACHE:-enabled}"
echo "=============================================="
echo ""

# Track timing
START_TIME=$(date +%s)

# Track build status
BUILD_SUCCESS=0
BUILD_FAILED=0
FAILED_IMAGES=""
SUCCESS_IMAGES=""

# Function to build a single image
build_image() {
    local name="$1"
    local dockerfile="$2"
    local context="$3"
    local build_args="$4"
    
    echo "----------------------------------------"
    echo "Building $name..."
    echo "----------------------------------------"
    
    local cmd="docker build -t ${name} ${NO_CACHE} ${build_args} -f ${dockerfile} ${context}"
    echo "Command: $cmd"
    echo ""
    
    if eval "$cmd"; then
        echo ""
        echo "✓ $name built successfully"
        return 0
    else
        echo ""
        echo "✗ $name build FAILED"
        return 1
    fi
}

# Build base image
if [ -z "$SKIP_BASE" ]; then
    echo ""
    if build_image "agentpod-base:dev" \
                   "$DOCKER_DIR/base/Dockerfile" \
                   "$DOCKER_DIR/base"; then
        SUCCESS_IMAGES="$SUCCESS_IMAGES base"
        BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
    else
        FAILED_IMAGES="$FAILED_IMAGES base"
        BUILD_FAILED=$((BUILD_FAILED + 1))
        echo ""
        echo "ERROR: Base image build failed! Cannot continue."
        exit 1
    fi
else
    echo "Skipping base image build (using existing agentpod-base:dev)"
    
    # Verify base image exists
    if ! docker image inspect agentpod-base:dev &>/dev/null; then
        echo "ERROR: agentpod-base:dev not found. Run without --skip-base first."
        exit 1
    fi
fi

# Build flavors
echo ""
echo "=============================================="
echo "  Building Flavors"
echo "=============================================="

for flavor in $SELECTED_FLAVORS; do
    dockerfile="$DOCKER_DIR/flavors/$flavor/Dockerfile"
    
    if [ ! -f "$dockerfile" ]; then
        echo "✗ Dockerfile not found for flavor: $flavor"
        FAILED_IMAGES="$FAILED_IMAGES $flavor"
        BUILD_FAILED=$((BUILD_FAILED + 1))
        continue
    fi
    
    echo ""
    if build_image "agentpod-${flavor}:dev" \
                   "$dockerfile" \
                   "$DOCKER_DIR/flavors/$flavor" \
                   "--build-arg BASE_IMAGE=agentpod-base:dev"; then
        SUCCESS_IMAGES="$SUCCESS_IMAGES $flavor"
        BUILD_SUCCESS=$((BUILD_SUCCESS + 1))
    else
        FAILED_IMAGES="$FAILED_IMAGES $flavor"
        BUILD_FAILED=$((BUILD_FAILED + 1))
    fi
done

# Calculate elapsed time
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$((ELAPSED / 60))
SECONDS=$((ELAPSED % 60))

# Print summary
echo ""
echo "=============================================="
echo "  Build Complete!"
echo "=============================================="
echo ""
echo "  Successful ($BUILD_SUCCESS):"
for img in $SUCCESS_IMAGES; do
    echo "    ✓ agentpod-${img}:dev"
done

if [ -n "$FAILED_IMAGES" ]; then
    echo ""
    echo "  Failed ($BUILD_FAILED):"
    for img in $FAILED_IMAGES; do
        echo "    ✗ agentpod-${img}:dev"
    done
fi

echo ""
echo "  Time: ${MINUTES}m ${SECONDS}s"
echo ""
echo "  Built Images:"
docker images --format "    {{.Repository}}:{{.Tag}}  {{.Size}}" | grep "agentpod.*:dev" | sort
echo ""
echo "=============================================="

if [ $BUILD_FAILED -gt 0 ]; then
    exit 1
fi
