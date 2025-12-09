#!/bin/bash
# Local test script for ACP Gateway
# Run from: docker/opencode/acp-gateway/

set -e

PORT=4097
BASE_URL="http://localhost:$PORT"

echo "=== ACP Gateway Local Test ==="
echo ""

# Check if already running
if curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
    echo "Gateway already running on port $PORT"
else
    echo "Starting ACP Gateway on port $PORT..."
    echo "(Press Ctrl+C to stop)"
    echo ""
    
    # Create test workspace
    mkdir -p /tmp/acp-test-workspace
    
    # Start in background for testing, or foreground if --fg flag
    if [[ "$1" == "--fg" ]]; then
        WORKSPACE_DIR=/tmp/acp-test-workspace ACP_GATEWAY_PORT=$PORT bun run src/index.ts
        exit 0
    fi
    
    WORKSPACE_DIR=/tmp/acp-test-workspace ACP_GATEWAY_PORT=$PORT bun run src/index.ts &
    GATEWAY_PID=$!
    
    # Wait for startup
    echo "Waiting for gateway to start..."
    for i in {1..10}; do
        if curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
            echo "Gateway started!"
            break
        fi
        sleep 1
    done
fi

echo ""
echo "=== Running Tests ==="
echo ""

# Test 1: Health check
echo "1. Health check..."
curl -s "$BASE_URL/health" | jq .
echo ""

# Test 2: Gateway info
echo "2. Gateway info..."
curl -s "$BASE_URL/info" | jq .
echo ""

# Test 3: List agents
echo "3. List agents..."
curl -s "$BASE_URL/agents" | jq .
echo ""

# Test 4: Agent status (opencode)
echo "4. OpenCode agent status..."
curl -s "$BASE_URL/agents/opencode/status" | jq .
echo ""

echo "=== Basic Tests Complete ==="
echo ""
echo "To test with OpenCode agent (requires opencode installed):"
echo "  curl -X POST $BASE_URL/agents/opencode/spawn"
echo ""
echo "To test sessions:"
echo "  curl -X POST $BASE_URL/session -H 'Content-Type: application/json' -d '{\"agentId\": \"opencode\"}'"
echo ""
echo "To watch events:"
echo "  curl -N $BASE_URL/events"
echo ""

# Cleanup if we started the gateway
if [[ -n "$GATEWAY_PID" ]]; then
    echo "Stopping gateway (PID: $GATEWAY_PID)..."
    kill $GATEWAY_PID 2>/dev/null || true
fi
