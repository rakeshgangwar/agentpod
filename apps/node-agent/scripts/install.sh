#!/usr/bin/env bash
# install.sh — curl-based installer for the AgentPod node-agent.
#
# Usage:
#   curl -fsSL https://github.com/rakeshgangwar/agentpod/releases/latest/download/install.sh \
#     | sudo bash -s -- <HUB_URL> <TOKEN>
#
#   HUB_URL   e.g. https://hub.agentpod.dev
#   TOKEN     enrollment token issued by the hub
#
# Optional environment variables:
#   VERSION   pin to a specific release tag (e.g. v0.2.0); default: latest release

set -euo pipefail

# ---------------------------------------------------------------------------
# Usage / arg validation
# ---------------------------------------------------------------------------
usage() {
  echo "Usage: $0 <HUB_URL> <TOKEN>" >&2
  echo "" >&2
  echo "  HUB_URL   hub URL, must start with http:// or https://" >&2
  echo "  TOKEN     enrollment token issued by the hub" >&2
  echo "" >&2
  echo "Optional env:" >&2
  echo "  VERSION   pin release tag, e.g. VERSION=v0.2.0" >&2
  exit 1
}

[[ "${1:-}" =~ ^https?:// ]] || { echo "ERROR: HUB_URL must start with http:// or https://" >&2; usage; }
[[ -n "${2:-}" ]] || { echo "ERROR: TOKEN is required" >&2; usage; }

HUB_URL="$1"
TOKEN="$2"

# ---------------------------------------------------------------------------
# Root guard — re-exec with sudo if needed
# ---------------------------------------------------------------------------
if [ "$(id -u)" != "0" ]; then
  echo "INFO: not running as root — re-executing with sudo..."
  exec sudo \
    VERSION="${VERSION:-}" \
    bash "$0" "$@"
fi

# ---------------------------------------------------------------------------
# OS / arch detection
# ---------------------------------------------------------------------------
echo "==> [1/5] Detecting OS and architecture..."

_os_raw="$(uname -s)"
case "$_os_raw" in
  Linux)  OS=linux  ;;
  Darwin) OS=darwin ;;
  *)
    echo "ERROR: unsupported OS: $_os_raw" >&2
    echo "       agentpod-node supports Linux and macOS only." >&2
    exit 1
    ;;
esac

_arch_raw="$(uname -m)"
case "$_arch_raw" in
  x86_64)          ARCH=amd64 ;;
  aarch64|arm64)   ARCH=arm64 ;;
  *)
    echo "ERROR: unsupported architecture: $_arch_raw" >&2
    echo "       agentpod-node supports x86_64 and arm64 only." >&2
    exit 1
    ;;
esac

echo "    OS=$OS  ARCH=$ARCH"

# ---------------------------------------------------------------------------
# Release URL base
# ---------------------------------------------------------------------------
REPO="rakeshgangwar/agentpod"
BASE_URL="https://github.com/${REPO}/releases"

if [[ -n "${VERSION:-}" ]]; then
  DOWNLOAD_BASE="${BASE_URL}/download/${VERSION}"
  echo "    Pinned version: ${VERSION}"
else
  DOWNLOAD_BASE="${BASE_URL}/latest/download"
  echo "    Using latest release"
fi

# ---------------------------------------------------------------------------
# Download binary
# ---------------------------------------------------------------------------
echo "==> [2/5] Downloading agentpod-node-${OS}-${ARCH}..."

BINARY_URL="${DOWNLOAD_BASE}/agentpod-node-${OS}-${ARCH}"
DEST_BIN="/usr/local/bin/agentpod-node"

if ! curl -fSL --progress-bar -o "$DEST_BIN" "$BINARY_URL"; then
  echo "" >&2
  echo "ERROR: download failed: ${BINARY_URL}" >&2
  echo "       Make sure a release exists for this version/arch." >&2
  echo "       Available releases: https://github.com/${REPO}/releases" >&2
  exit 1
fi

chmod 0755 "$DEST_BIN"
echo "    Installed to ${DEST_BIN}"

# Short alias: `apn` -> agentpod-node, so you can type `apn run`, `apn enroll`, …
ln -sf "$DEST_BIN" /usr/local/bin/apn
echo "    Alias: apn -> ${DEST_BIN}"

# ---------------------------------------------------------------------------
# Enroll
# ---------------------------------------------------------------------------
echo "==> [3/5] Enrolling node with hub at ${HUB_URL}..."
# On macOS there's no system service manager here — the user runs
# `agentpod-node run` themselves. macOS sudo preserves $HOME, so enrolling as
# root would write the config into the user's dir but root-owned, and `run`
# (as the user) then can't read it. Enroll AS the invoking user so the config
# is user-owned and readable. On Linux the service runs as root, so root-owned
# config is correct — keep enrolling as root there.
if [[ "$OS" == "darwin" && -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
  sudo -u "$SUDO_USER" "$DEST_BIN" enroll --hub "$HUB_URL" --token "$TOKEN"
else
  "$DEST_BIN" enroll --hub "$HUB_URL" --token "$TOKEN"
fi
echo "    Enrolled."

# ---------------------------------------------------------------------------
# Platform-specific service setup
# ---------------------------------------------------------------------------
if [[ "$OS" == "linux" ]]; then
  # ---- Linux: systemd -------------------------------------------------------
  echo "==> [4/5] Downloading systemd unit..."

  UNIT_URL="${DOWNLOAD_BASE}/agentpod-node.service"
  UNIT_DEST="/etc/systemd/system/agentpod-node.service"

  if ! curl -fSL --progress-bar -o "$UNIT_DEST" "$UNIT_URL"; then
    echo "" >&2
    echo "ERROR: failed to download unit file: ${UNIT_URL}" >&2
    echo "       Make sure a release exists that includes the .service file." >&2
    exit 1
  fi

  chmod 0644 "$UNIT_DEST"
  echo "    Unit installed at ${UNIT_DEST}"

  echo "==> [5/5] Enabling and starting agentpod-node service..."
  systemctl daemon-reload
  systemctl enable --now agentpod-node
  echo ""
  echo "Done. agentpod-node is running as a systemd service."
  echo "  Check status:  systemctl status agentpod-node"
  echo "  Follow logs:   journalctl -u agentpod-node -f"

elif [[ "$OS" == "darwin" ]]; then
  # ---- macOS: no systemd ----------------------------------------------------
  echo "==> [4/5] (macOS) Skipping systemd setup — not applicable."
  echo "==> [5/5] Installation complete."
  echo ""
  echo "Done. agentpod-node is installed and enrolled."
  echo ""
  echo "NOTE: macOS does not use systemd. To run the agent persistently:"
  echo "  Option 1 — run interactively:  apn run    (alias for agentpod-node)"
  echo "  Option 2 — set up a launchd plist (LaunchDaemon or LaunchAgent)."
  echo "             Example plist skeleton:"
  echo "               /Library/LaunchDaemons/dev.agentpod.node.plist"
  echo "             with ProgramArguments: [\"/usr/local/bin/agentpod-node\", \"run\"]"
fi
