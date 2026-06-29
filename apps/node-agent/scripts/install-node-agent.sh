#!/usr/bin/env bash
# install-node-agent.sh — install + enroll the AgentPod node-agent as a systemd service.
#
# Usage:
#   install-node-agent.sh <HUB_URL> <TOKEN> [BINARY_PATH]
#
#   HUB_URL      e.g. https://hub.agentpod.dev
#   TOKEN        enrollment token issued by the hub
#   BINARY_PATH  (optional) path to a pre-built agentpod-node binary;
#                falls back to ./agentpod-node or builds from source.
#
# Target paths can be overridden via env vars (used by the test harness):
#   BIN_DIR   default /usr/local/bin
#   UNIT_DIR  default /etc/systemd/system
#   UNIT_SRC  default <script-dir>/../deploy/agentpod-node.service
#
# The script is idempotent: re-running upgrades the binary and re-enrolls.

set -euo pipefail

# ---------------------------------------------------------------------------
# Args / usage
# ---------------------------------------------------------------------------
usage() {
  echo "Usage: $0 <HUB_URL> <TOKEN> [BINARY_PATH]" >&2
  exit 1
}

[[ "${1:-}" =~ ^https?:// ]] || { echo "ERROR: HUB_URL must start with http:// or https://" >&2; usage; }
[[ -n "${2:-}" ]] || { echo "ERROR: TOKEN is required" >&2; usage; }

HUB_URL="$1"
TOKEN="$2"
BINARY_ARG="${3:-}"

# ---------------------------------------------------------------------------
# Target paths (overridable for testing)
# ---------------------------------------------------------------------------
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_SRC="${UNIT_SRC:-${SCRIPT_DIR}/../deploy/agentpod-node.service}"

BINARY_DEST="${BIN_DIR}/agentpod-node"
UNIT_DEST="${UNIT_DIR}/agentpod-node.service"

# ---------------------------------------------------------------------------
# Root guard
# ---------------------------------------------------------------------------
if [ "$(id -u)" != "0" ]; then
  echo "INFO: not running as root — re-executing with sudo..."
  exec sudo \
    BIN_DIR="$BIN_DIR" \
    UNIT_DIR="$UNIT_DIR" \
    UNIT_SRC="$UNIT_SRC" \
    bash "$0" "$@"
fi

# ---------------------------------------------------------------------------
# Step 1: Resolve the binary
# ---------------------------------------------------------------------------
echo "==> [1/4] Resolving binary..."

if [[ -n "$BINARY_ARG" ]] && [[ -f "$BINARY_ARG" ]]; then
  SRC_BINARY="$BINARY_ARG"
  echo "    Using provided binary: $SRC_BINARY"
elif [[ -f "./agentpod-node" ]]; then
  SRC_BINARY="./agentpod-node"
  echo "    Using ./agentpod-node"
elif command -v go >/dev/null 2>&1 && [[ -f "${SCRIPT_DIR}/../go.mod" ]]; then
  echo "    No binary found — building from source (go build)..."
  BUILD_OUT="$(mktemp -d)/agentpod-node"
  (cd "${SCRIPT_DIR}/.." && go build -o "$BUILD_OUT" ./cmd/agentpod-node)
  SRC_BINARY="$BUILD_OUT"
  echo "    Built: $SRC_BINARY"
else
  echo "ERROR: no binary found and Go is not available to build one." >&2
  echo "       Provide the path as a third argument: $0 $HUB_URL $TOKEN /path/to/agentpod-node" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Install the binary
# ---------------------------------------------------------------------------
echo "==> [2/4] Installing binary to ${BINARY_DEST}..."
mkdir -p "$BIN_DIR"
install -m 0755 "$SRC_BINARY" "$BINARY_DEST"
echo "    Installed."

# ---------------------------------------------------------------------------
# Step 3: Enroll the node
# ---------------------------------------------------------------------------
echo "==> [3/4] Enrolling node with hub at ${HUB_URL}..."
"$BINARY_DEST" enroll --hub "$HUB_URL" --token "$TOKEN"
echo "    Enrolled."

# ---------------------------------------------------------------------------
# Step 4: Install the systemd unit and enable the service
# ---------------------------------------------------------------------------
echo "==> [4/4] Installing systemd unit..."

if [[ ! -f "$UNIT_SRC" ]]; then
  echo "ERROR: unit file not found at ${UNIT_SRC}" >&2
  echo "       Clone the repo or set UNIT_SRC to the agentpod-node.service path." >&2
  exit 1
fi

mkdir -p "$UNIT_DIR"
install -m 0644 "$UNIT_SRC" "$UNIT_DEST"
echo "    Unit installed at ${UNIT_DEST}."

systemctl daemon-reload
echo "    daemon-reload done."

systemctl enable --now agentpod-node
echo "    Service enabled and started."

echo ""
echo "Done. Check status with: systemctl status agentpod-node"
echo "      Follow logs with:   journalctl -u agentpod-node -f"
