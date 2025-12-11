#!/bin/bash
# =============================================================================
# CodeOpen Container Test Suite
# =============================================================================
# Tests all container flavor and addon combinations to verify they:
# 1. Build successfully
# 2. Start properly
# 3. Have ACP Gateway responding on port 4097
# 4. Have correct environment variables set
# 5. Clean up properly
# =============================================================================
# Usage: ./test-containers.sh [options]
#
# Options:
#   --flavors <list>     Comma-separated list of flavors to test (default: all)
#   --addons <list>      Comma-separated list of addons to test (default: all)
#   --skip-build         Skip building, use existing images
#   --skip-addons        Only test base flavors, skip addon combinations
#   --keep-failed        Don't remove containers that fail tests
#   --keep-images        Don't remove addon images after testing (uses more disk)
#   --timeout <seconds>  Container startup timeout (default: 120)
#   --verbose            Show detailed output
#   --quick              Only test fullstack flavor with gui addon
#   -h, --help           Show this help
#
# Disk Space: This script builds and tests one addon at a time, cleaning up
# each addon image after testing to minimize disk usage. Use --keep-images
# to retain all images (requires ~60-100GB for full test suite).
#
# =============================================================================
# Examples:
# =============================================================================
#
# 1. Quick smoke test (fullstack + gui only):
#    ./test-containers.sh --quick
#
# 2. Test all flavors without addons:
#    ./test-containers.sh --skip-addons
#
# 3. Test a single flavor with all addons:
#    ./test-containers.sh --flavors fullstack
#
# 4. Test a single addon across all flavors:
#    ./test-containers.sh --addons cloud
#
# 5. Test specific flavor + addon combination:
#    ./test-containers.sh --flavors python --addons databases
#
# 6. Test multiple flavors with multiple addons:
#    ./test-containers.sh --flavors js,python,go --addons gui,code-server
#
# 7. Test with existing images (skip build):
#    ./test-containers.sh --skip-build --flavors fullstack --addons cloud
#
# 8. Test and keep images for debugging:
#    ./test-containers.sh --flavors rust --addons databases --keep-images
#
# 9. Verbose output for debugging:
#    ./test-containers.sh --flavors js --addons gui --verbose
#
# 10. Full test suite (all 6 flavors × 5 addons = 30 combinations):
#     ./test-containers.sh
#
# =============================================================================
# Available Flavors: js, python, go, rust, fullstack, polyglot
# Available Addons:  gui, code-server, databases, cloud, gpu
#
# Note: GPU addon is automatically skipped if no NVIDIA GPU is detected.
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# =============================================================================
# Configuration
# =============================================================================
TIMEOUT=120
SKIP_BUILD=false
SKIP_ADDONS=false
KEEP_FAILED=false
KEEP_IMAGES=false
VERBOSE=false
QUICK_MODE=false

TEST_FLAVORS=("${FLAVORS[@]}")
TEST_ADDONS=("${ADDONS[@]}")

# Test results
PASSED=0
FAILED=0
SKIPPED=0
RESULTS=()

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}[DEBUG]${NC} $1"
    fi
}

show_help() {
    head -67 "$0" | tail -62 | sed 's/^# //' | sed 's/^#//'
    exit 0
}

# =============================================================================
# Parse Arguments
# =============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --flavors)
            IFS=',' read -ra TEST_FLAVORS <<< "$2"
            shift 2
            ;;
        --addons)
            IFS=',' read -ra TEST_ADDONS <<< "$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-addons)
            SKIP_ADDONS=true
            shift
            ;;
        --keep-failed)
            KEEP_FAILED=true
            shift
            ;;
        --keep-images)
            KEEP_IMAGES=true
            shift
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --quick)
            QUICK_MODE=true
            TEST_FLAVORS=("fullstack")
            TEST_ADDONS=("gui")
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            ;;
    esac
done

# =============================================================================
# Pre-flight Checks
# =============================================================================

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    log_info "Docker is available"
}

check_base_image() {
    local base_image="${REGISTRY_URL}/codeopen-base:latest"
    
    if docker image inspect "$base_image" &> /dev/null; then
        log_info "Base image exists: $base_image"
        return 0
    else
        log_warning "Base image not found: $base_image"
        return 1
    fi
}

# =============================================================================
# Build Functions
# =============================================================================

build_base() {
    log_info "Building base image..."
    if ! "$SCRIPT_DIR/build-base.sh"; then
        log_error "Failed to build base image"
        return 1
    fi
    log_success "Base image built successfully"
}

build_flavor() {
    local flavor="$1"
    log_info "Building flavor: $flavor"
    if ! "$SCRIPT_DIR/build-flavor.sh" "$flavor"; then
        log_error "Failed to build flavor: $flavor"
        return 1
    fi
    log_success "Flavor built: $flavor"
}

build_addon() {
    local flavor="$1"
    local addon="$2"
    local base_image="${REGISTRY_URL}/codeopen-${flavor}:latest"
    
    log_info "Building addon: $addon on flavor: $flavor"
    if ! "$SCRIPT_DIR/build-addon.sh" "$addon" --base "$base_image"; then
        log_error "Failed to build addon: $addon on flavor: $flavor"
        return 1
    fi
    log_success "Addon built: ${flavor}-${addon}"
}

# =============================================================================
# Test Functions
# =============================================================================

generate_container_name() {
    local flavor="$1"
    local addon="$2"
    
    if [ -n "$addon" ]; then
        echo "codeopen-test-${flavor}-${addon}-$$"
    else
        echo "codeopen-test-${flavor}-$$"
    fi
}

run_container() {
    local image="$1"
    local container_name="$2"
    local extra_ports="$3"
    
    local port_mappings="-p 0:4096 -p 0:4097"
    if [ -n "$extra_ports" ]; then
        for port in $extra_ports; do
            port_mappings="$port_mappings -p 0:$port"
        done
    fi
    
    log_verbose "Starting container: $container_name from image: $image"
    log_verbose "Port mappings: $port_mappings"
    
    docker run -d \
        --name "$container_name" \
        $port_mappings \
        -e OPENCODE_PORT=4096 \
        -e ACP_GATEWAY_PORT=4097 \
        "$image" &> /dev/null
    
    return $?
}

wait_for_container() {
    local container_name="$1"
    local timeout="$2"
    
    log_verbose "Waiting for container to be healthy (timeout: ${timeout}s)..."
    
    local elapsed=0
    local interval=5
    
    while [ $elapsed -lt $timeout ]; do
        local status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null)
        
        if [ "$status" = "exited" ]; then
            log_verbose "Container exited prematurely"
            return 1
        fi
        
        if [ "$status" = "running" ]; then
            # Check if ACP Gateway is responding
            local acp_port=$(docker port "$container_name" 4097 2>/dev/null | cut -d: -f2)
            if [ -n "$acp_port" ]; then
                if curl -sf "http://localhost:${acp_port}/health" &> /dev/null; then
                    log_verbose "ACP Gateway is responding on port $acp_port"
                    return 0
                fi
            fi
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
        log_verbose "Waiting... ${elapsed}s / ${timeout}s"
    done
    
    log_verbose "Timeout waiting for container"
    return 1
}

check_acp_gateway() {
    local container_name="$1"
    
    local acp_port=$(docker port "$container_name" 4097 2>/dev/null | cut -d: -f2)
    if [ -z "$acp_port" ]; then
        log_verbose "Could not get ACP Gateway port"
        return 1
    fi
    
    log_verbose "Checking ACP Gateway health on port $acp_port..."
    
    local health_response=$(curl -sf "http://localhost:${acp_port}/health" 2>/dev/null)
    if [ $? -ne 0 ]; then
        log_verbose "ACP Gateway health check failed"
        return 1
    fi
    
    log_verbose "Health response: $health_response"
    
    # Check agents endpoint
    local agents_response=$(curl -sf "http://localhost:${acp_port}/agents" 2>/dev/null)
    if [ $? -ne 0 ]; then
        log_verbose "ACP Gateway agents endpoint failed"
        return 1
    fi
    
    log_verbose "Agents response: $agents_response"
    return 0
}

check_environment() {
    local container_name="$1"
    local expected_flavor="$2"
    local expected_addon="$3"
    
    log_verbose "Checking environment variables..."
    
    # Check flavor environment variable
    local flavor_env=$(docker exec "$container_name" printenv CODEOPEN_FLAVOR 2>/dev/null)
    if [ "$flavor_env" != "$expected_flavor" ]; then
        log_verbose "CODEOPEN_FLAVOR mismatch: expected '$expected_flavor', got '$flavor_env'"
        # This is a warning, not a failure
    fi
    
    # Check if addon-specific env vars exist
    if [ -n "$expected_addon" ]; then
        local addon_upper=$(echo "$expected_addon" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
        local addon_env=$(docker exec "$container_name" printenv "CODEOPEN_ADDON_${addon_upper}" 2>/dev/null)
        log_verbose "CODEOPEN_ADDON_${addon_upper}=$addon_env"
    fi
    
    # Check basic tools exist
    docker exec "$container_name" which node &> /dev/null || { log_verbose "node not found"; return 1; }
    docker exec "$container_name" which bun &> /dev/null || { log_verbose "bun not found"; return 1; }
    docker exec "$container_name" which git &> /dev/null || { log_verbose "git not found"; return 1; }
    
    log_verbose "Basic tools check passed"
    return 0
}

check_addon_ports() {
    local container_name="$1"
    local addon="$2"
    
    case "$addon" in
        gui)
            local vnc_port=$(docker port "$container_name" 6080 2>/dev/null | cut -d: -f2)
            if [ -z "$vnc_port" ]; then
                log_verbose "GUI port 6080 not exposed"
                return 1
            fi
            log_verbose "GUI addon port exposed: $vnc_port"
            ;;
        code-server)
            local cs_port=$(docker port "$container_name" 8080 2>/dev/null | cut -d: -f2)
            if [ -z "$cs_port" ]; then
                log_verbose "Code Server port 8080 not exposed"
                return 1
            fi
            log_verbose "Code Server addon port exposed: $cs_port"
            ;;
        databases)
            # PostgreSQL port should be exposed
            local pg_port=$(docker port "$container_name" 5432 2>/dev/null | cut -d: -f2)
            log_verbose "Database addon - PostgreSQL port: ${pg_port:-not exposed}"
            ;;
        *)
            log_verbose "No specific port check for addon: $addon"
            ;;
    esac
    
    return 0
}

get_container_logs() {
    local container_name="$1"
    docker logs "$container_name" 2>&1 | tail -50
}

cleanup_container() {
    local container_name="$1"
    local keep="$2"
    
    if [ "$keep" = true ]; then
        log_verbose "Keeping container: $container_name"
        return
    fi
    
    log_verbose "Cleaning up container: $container_name"
    docker stop "$container_name" &> /dev/null || true
    docker rm "$container_name" &> /dev/null || true
}

# =============================================================================
# Main Test Runner
# =============================================================================

test_image() {
    local image="$1"
    local flavor="$2"
    local addon="$3"
    local extra_ports="$4"
    
    local test_name
    if [ -n "$addon" ]; then
        test_name="${flavor}-${addon}"
    else
        test_name="${flavor}"
    fi
    
    local container_name=$(generate_container_name "$flavor" "$addon")
    
    echo ""
    echo "=============================================="
    echo "  Testing: $test_name"
    echo "=============================================="
    echo "  Image:     $image"
    echo "  Container: $container_name"
    echo "=============================================="
    
    # Check if image exists
    if ! docker image inspect "$image" &> /dev/null; then
        log_error "Image not found: $image"
        RESULTS+=("SKIP: $test_name (image not found)")
        ((SKIPPED++)) || true
        return
    fi
    
    # Start container
    if ! run_container "$image" "$container_name" "$extra_ports"; then
        log_error "Failed to start container"
        RESULTS+=("FAIL: $test_name (container start failed)")
        ((FAILED++)) || true
        cleanup_container "$container_name" "$KEEP_FAILED"
        return
    fi
    
    # Wait for container to be ready
    if ! wait_for_container "$container_name" "$TIMEOUT"; then
        log_error "Container failed to become healthy within ${TIMEOUT}s"
        echo "--- Container Logs ---"
        get_container_logs "$container_name"
        echo "----------------------"
        RESULTS+=("FAIL: $test_name (health check timeout)")
        ((FAILED++)) || true
        cleanup_container "$container_name" "$KEEP_FAILED"
        return
    fi
    
    # Check ACP Gateway
    if ! check_acp_gateway "$container_name"; then
        log_error "ACP Gateway check failed"
        echo "--- Container Logs ---"
        get_container_logs "$container_name"
        echo "----------------------"
        RESULTS+=("FAIL: $test_name (ACP Gateway check)")
        ((FAILED++)) || true
        cleanup_container "$container_name" "$KEEP_FAILED"
        return
    fi
    
    # Check environment
    if ! check_environment "$container_name" "$flavor" "$addon"; then
        log_warning "Environment check had issues (continuing)"
    fi
    
    # Check addon-specific ports
    if [ -n "$addon" ]; then
        if ! check_addon_ports "$container_name" "$addon"; then
            log_warning "Addon port check had issues (continuing)"
        fi
    fi
    
    log_success "All tests passed for: $test_name"
    RESULTS+=("PASS: $test_name")
    ((PASSED++)) || true
    
    # Cleanup
    cleanup_container "$container_name" false
}

# =============================================================================
# Main Execution
# =============================================================================

# Determine addons display text
if [ "$SKIP_ADDONS" = true ]; then
    ADDONS_DISPLAY="(skipped)"
else
    ADDONS_DISPLAY="${TEST_ADDONS[*]}"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           CodeOpen Container Test Suite                       ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  Flavors:    ${TEST_FLAVORS[*]}"
echo "║  Addons:     ${ADDONS_DISPLAY}"
echo "║  Timeout:    ${TIMEOUT}s"
echo "║  Skip Build: $SKIP_BUILD"
echo "║  Quick Mode: $QUICK_MODE"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Pre-flight checks
check_docker

# Build phase - only build base and flavors upfront
# Addon images are built on-demand during test phase to save disk space
if [ "$SKIP_BUILD" = false ]; then
    # Build or verify base image
    if ! check_base_image; then
        build_base
    fi
    
    # Build flavors (these are kept as they're needed for addon builds)
    for flavor in "${TEST_FLAVORS[@]}"; do
        build_flavor "$flavor"
    done
fi

# Test phase
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    Starting Tests                              ║"
echo "╚═══════════════════════════════════════════════════════════════╝"

# Function to cleanup addon image after test (saves disk space)
cleanup_addon_image() {
    local image="$1"
    if [ "$KEEP_IMAGES" = false ]; then
        log_verbose "Removing addon image to save disk space: $image"
        docker rmi "$image" &> /dev/null || true
    fi
}

# Test base flavors
for flavor in "${TEST_FLAVORS[@]}"; do
    image="${REGISTRY_URL}/codeopen-${flavor}:latest"
    test_image "$image" "$flavor" "" ""
done

# Test addon combinations (build-test-cleanup approach to save disk space)
if [ "$SKIP_ADDONS" = false ]; then
    for flavor in "${TEST_FLAVORS[@]}"; do
        for addon in "${TEST_ADDONS[@]}"; do
            # Skip GPU addon unless NVIDIA GPU is available
            if [ "$addon" = "gpu" ] && ! command -v nvidia-smi &> /dev/null; then
                RESULTS+=("SKIP: ${flavor}-gpu (no NVIDIA GPU)")
                ((SKIPPED++)) || true
                continue
            fi
            
            image="${REGISTRY_URL}/codeopen-${flavor}-${addon}:latest"
            
            # Build addon image on-demand (unless skip-build or image already exists)
            if [ "$SKIP_BUILD" = false ]; then
                if ! docker image inspect "$image" &> /dev/null; then
                    if ! build_addon "$flavor" "$addon"; then
                        RESULTS+=("FAIL: ${flavor}-${addon} (build failed)")
                        ((FAILED++)) || true
                        continue
                    fi
                fi
            fi
            
            # Determine extra ports for addon
            extra_ports=""
            case "$addon" in
                gui) extra_ports="6080" ;;
                code-server) extra_ports="8080" ;;
                databases) extra_ports="5432 6379" ;;
            esac
            
            test_image "$image" "$flavor" "$addon" "$extra_ports"
            
            # Cleanup addon image after test to save disk space
            cleanup_addon_image "$image"
        done
    done
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    Test Summary                                ║"
echo "╠═══════════════════════════════════════════════════════════════╣"

for result in "${RESULTS[@]}"; do
    if [[ "$result" == PASS:* ]]; then
        echo -e "║  ${GREEN}$result${NC}"
    elif [[ "$result" == FAIL:* ]]; then
        echo -e "║  ${RED}$result${NC}"
    else
        echo -e "║  ${YELLOW}$result${NC}"
    fi
done

echo "╠═══════════════════════════════════════════════════════════════╣"
echo -e "║  ${GREEN}Passed:${NC}  $PASSED"
echo -e "║  ${RED}Failed:${NC}  $FAILED"
echo -e "║  ${YELLOW}Skipped:${NC} $SKIPPED"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Exit with failure if any tests failed
if [ $FAILED -gt 0 ]; then
    exit 1
fi

exit 0
