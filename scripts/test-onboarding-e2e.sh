#!/bin/bash
# ==============================================================================
# Onboarding E2E Test Script
# ==============================================================================
#
# Quick verification script for the onboarding system flow:
# 1. Checks prerequisites (Docker, image, database)
# 2. Starts the API (if not running)
# 3. Creates a test container with onboarding config
# 4. Verifies agent installation and MCP communication
# 5. Cleans up
#
# Usage:
#   ./scripts/test-onboarding-e2e.sh
#   ./scripts/test-onboarding-e2e.sh --skip-api    # Don't start API (assume running)
#   ./scripts/test-onboarding-e2e.sh --no-cleanup  # Don't cleanup container
#
# ==============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_IMAGE="agentpod-fullstack:latest"
CONTAINER_NAME="e2e-onboarding-test-$$"
API_PORT=3001
API_URL="http://localhost:${API_PORT}"
DATABASE_URL="${DATABASE_URL:-postgres://agentpod:agentpod-dev-password@localhost:5432/agentpod}"

# API Token: Use API_TOKEN env var, or read from apps/api/.env, or fall back to default
if [ -z "$API_TOKEN" ]; then
  # Try to read from .env file
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  ENV_FILE="$SCRIPT_DIR/../apps/api/.env"
  if [ -f "$ENV_FILE" ]; then
    API_TOKEN=$(grep "^API_TOKEN=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  fi
fi
API_TOKEN="${API_TOKEN:-dev-token-change-in-production}"

# Parse arguments
SKIP_API=false
NO_CLEANUP=false
for arg in "$@"; do
  case $arg in
    --skip-api)
      SKIP_API=true
      ;;
    --no-cleanup)
      NO_CLEANUP=true
      ;;
  esac
done

# Cleanup function
cleanup() {
  if [ "$NO_CLEANUP" = false ]; then
    echo -e "${BLUE}Cleaning up...${NC}"
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
    if [ "$API_PID" != "" ]; then
      kill $API_PID 2>/dev/null || true
    fi
  fi
}
trap cleanup EXIT

# Helper functions
print_step() {
  echo -e "\n${BLUE}==>${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}!${NC} $1"
}

# ==============================================================================
# Step 1: Check Prerequisites
# ==============================================================================

print_step "Checking prerequisites..."

# Check Docker
if ! docker info > /dev/null 2>&1; then
  print_error "Docker is not running"
  exit 1
fi
print_success "Docker is running"

# Check image exists
if ! docker image inspect "$TEST_IMAGE" > /dev/null 2>&1; then
  print_error "Image '$TEST_IMAGE' not found"
  echo "Build it with: cd docker && ./scripts/build.sh"
  exit 1
fi
print_success "Image '$TEST_IMAGE' exists"

# Check PostgreSQL
if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
  print_warning "PostgreSQL may not be running on localhost:5432"
fi

# ==============================================================================
# Step 2: Start API (if needed)
# ==============================================================================

API_PID=""
if [ "$SKIP_API" = false ]; then
  # Check if API is already running
  if curl -s "http://localhost:${API_PORT}/health" > /dev/null 2>&1; then
    print_success "API already running on port ${API_PORT}"
  else
    print_step "Starting API..."
    cd "$(dirname "$0")/../apps/api"
    DATABASE_URL="$DATABASE_URL" bun run dev &
    API_PID=$!
    
    # Wait for API to be ready
    echo "Waiting for API to start..."
    for i in {1..30}; do
      if curl -s "http://localhost:${API_PORT}/health" > /dev/null 2>&1; then
        print_success "API started on port ${API_PORT}"
        break
      fi
      sleep 1
    done
    
    if ! curl -s "http://localhost:${API_PORT}/health" > /dev/null 2>&1; then
      print_error "API failed to start within 30 seconds"
      exit 1
    fi
    cd - > /dev/null
  fi
else
  print_warning "Skipping API start (--skip-api)"
fi

# ==============================================================================
# Step 3: Create Test Container
# ==============================================================================

print_step "Creating test container with onboarding configuration..."

SESSION_ID="e2e-test-session-$(date +%s)"

docker run -d \
  --name "$CONTAINER_NAME" \
  -p 9999:80 \
  -e MANAGEMENT_API_URL="http://host.docker.internal:${API_PORT}" \
  -e ONBOARDING_MODE=true \
  -e ONBOARDING_SESSION_ID="$SESSION_ID" \
  --add-host=host.docker.internal:host-gateway \
  "$TEST_IMAGE" > /dev/null

print_success "Container '$CONTAINER_NAME' created"

# Wait for container to initialize
print_step "Waiting for container to initialize..."
sleep 15

# Check container is running
if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]; then
  print_error "Container is not running"
  docker logs "$CONTAINER_NAME"
  exit 1
fi
print_success "Container is running"

# ==============================================================================
# Step 4: Verify Agent Installation
# ==============================================================================

print_step "Verifying onboarding agent installation..."

# Check agents directory exists
AGENTS_LIST=$(docker exec "$CONTAINER_NAME" ls -la /home/workspace/.opencode/agent/ 2>&1 || echo "FAILED")
if echo "$AGENTS_LIST" | grep -q "onboarding.md"; then
  print_success "Onboarding agent installed"
else
  print_error "Onboarding agent not found"
  echo "$AGENTS_LIST"
  exit 1
fi

if echo "$AGENTS_LIST" | grep -q "workspace.md"; then
  print_success "Workspace agent installed"
else
  print_warning "Workspace agent not found (may be expected)"
fi

# Check opencode.json
print_step "Verifying opencode.json configuration..."

OPENCODE_CONFIG=$(docker exec "$CONTAINER_NAME" cat /home/workspace/opencode.json 2>&1 || echo "FAILED")
if echo "$OPENCODE_CONFIG" | grep -q "agentpod_knowledge"; then
  print_success "MCP server configured in opencode.json"
else
  print_warning "MCP server not found in opencode.json"
  echo "$OPENCODE_CONFIG"
fi

# ==============================================================================
# Step 5: Test MCP Communication
# ==============================================================================

print_step "Testing MCP communication from container..."

# Test tools/list
echo "Testing tools/list..."
MCP_RESPONSE=$(docker exec "$CONTAINER_NAME" curl -s \
  -X POST "http://host.docker.internal:${API_PORT}/api/mcp/knowledge" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -d '{"method": "tools/list"}' 2>&1 || echo "CURL_FAILED")

if echo "$MCP_RESPONSE" | grep -q "search_knowledge"; then
  print_success "MCP tools/list successful - found search_knowledge"
else
  print_error "MCP tools/list failed"
  echo "$MCP_RESPONSE"
  exit 1
fi

if echo "$MCP_RESPONSE" | grep -q "get_project_template"; then
  print_success "MCP tools/list successful - found get_project_template"
fi

# Test search_knowledge
echo "Testing search_knowledge tool..."
SEARCH_RESPONSE=$(docker exec "$CONTAINER_NAME" curl -s \
  -X POST "http://host.docker.internal:${API_PORT}/api/mcp/knowledge" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -d '{"method": "tools/call", "params": {"name": "search_knowledge", "arguments": {"query": "web application", "limit": 3}}}' 2>&1 || echo "CURL_FAILED")

if echo "$SEARCH_RESPONSE" | grep -q "content"; then
  print_success "MCP search_knowledge successful"
else
  print_warning "MCP search_knowledge may have failed"
  echo "$SEARCH_RESPONSE"
fi

# Test list_project_types
echo "Testing list_project_types tool..."
PROJECTS_RESPONSE=$(docker exec "$CONTAINER_NAME" curl -s \
  -X POST "http://host.docker.internal:${API_PORT}/api/mcp/knowledge" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -d '{"method": "tools/call", "params": {"name": "list_project_types", "arguments": {}}}' 2>&1 || echo "CURL_FAILED")

if echo "$PROJECTS_RESPONSE" | grep -q "web_app\|content"; then
  print_success "MCP list_project_types successful"
else
  print_warning "MCP list_project_types may have failed"
  echo "$PROJECTS_RESPONSE"
fi

# ==============================================================================
# Step 6: Summary
# ==============================================================================

echo ""
echo "=============================================="
echo -e "${GREEN}E2E Test Complete!${NC}"
echo "=============================================="
echo ""
echo "Container: $CONTAINER_NAME"
echo "Session ID: $SESSION_ID"
echo "API URL: $API_URL"
echo ""

if [ "$NO_CLEANUP" = true ]; then
  echo -e "${YELLOW}Container left running for inspection.${NC}"
  echo "Access homepage: http://localhost:9999"
  echo "View logs: docker logs $CONTAINER_NAME"
  echo "Shell: docker exec -it $CONTAINER_NAME bash"
  echo "Cleanup: docker rm -f $CONTAINER_NAME"
fi

echo ""
print_success "All E2E tests passed!"
