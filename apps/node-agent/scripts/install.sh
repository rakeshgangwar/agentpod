#!/usr/bin/env bash
# install.sh — curl-based installer for the AgentPod node-agent.
#
# System-wide (needs root; installs a systemd service):
#   curl -fsSL https://github.com/rakeshgangwar/agentpod/releases/latest/download/install.sh \
#     | sudo bash -s -- <HUB_URL> <TOKEN>
#
# Rootless (no sudo; installs into ~/.local/bin — for key-only hosts with no sudo password):
#   curl -fsSL https://github.com/rakeshgangwar/agentpod/releases/latest/download/install.sh \
#     | bash -s -- --user <HUB_URL> <TOKEN>
#
#   HUB_URL   e.g. https://hub.agentpod.dev
#   TOKEN     enrollment token issued by the hub
#   --user    rootless install (no sudo): binary in ~/.local/bin, config in ~/.config
#
# Optional env:
#   VERSION                 pin a release tag (e.g. v0.2.0); default: latest release
#   AGENTPOD_USER_INSTALL=1 same as --user

set -euo pipefail

usage() {
  echo "Usage: install.sh [--user] <HUB_URL> <TOKEN>" >&2
  echo "" >&2
  echo "  HUB_URL   hub URL, must start with http:// or https://" >&2
  echo "  TOKEN     enrollment token issued by the hub" >&2
  echo "  --user    rootless install into ~/.local/bin (no sudo; for key-only hosts)" >&2
  echo "" >&2
  echo "Optional env:  VERSION=v0.2.0   AGENTPOD_USER_INSTALL=1" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Args — pull out --user, collect positional HUB_URL + TOKEN
# ---------------------------------------------------------------------------
USER_INSTALL="${AGENTPOD_USER_INSTALL:-}"
ARGS=()
for a in "$@"; do
  if [ "$a" = "--user" ]; then USER_INSTALL=1; else ARGS+=("$a"); fi
done
HUB_URL="${ARGS[0]:-}"
TOKEN="${ARGS[1]:-}"

[[ "$HUB_URL" =~ ^https?:// ]] || { echo "ERROR: HUB_URL must start with http:// or https://" >&2; usage; }
[[ -n "$TOKEN" ]] || { echo "ERROR: TOKEN is required" >&2; usage; }

# ---------------------------------------------------------------------------
# Install mode: system (root) vs user (rootless)
# ---------------------------------------------------------------------------
if [ "$(id -u)" = "0" ]; then
  MODE=system
elif [ -n "$USER_INSTALL" ]; then
  MODE=user
elif command -v sudo >/dev/null 2>&1; then
  echo "INFO: not running as root — re-executing with sudo for a system-wide install."
  echo "      No sudo password on this host? Re-run rootless instead:"
  echo "        curl -fsSL .../install.sh | bash -s -- --user $HUB_URL <TOKEN>"
  exec sudo VERSION="${VERSION:-}" bash "$0" "$HUB_URL" "$TOKEN"
else
  echo "INFO: not root and 'sudo' not found — falling back to a rootless --user install."
  MODE=user
fi

# ---------------------------------------------------------------------------
# OS / arch detection
# ---------------------------------------------------------------------------
echo "==> Detecting OS and architecture..."
_os_raw="$(uname -s)"
case "$_os_raw" in
  Linux)  OS=linux  ;;
  Darwin) OS=darwin ;;
  *) echo "ERROR: unsupported OS: $_os_raw (Linux/macOS only)" >&2; exit 1 ;;
esac
_arch_raw="$(uname -m)"
case "$_arch_raw" in
  x86_64)        ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo "ERROR: unsupported architecture: $_arch_raw (x86_64/arm64 only)" >&2; exit 1 ;;
esac
echo "    OS=$OS  ARCH=$ARCH  MODE=$MODE"

# ---------------------------------------------------------------------------
# Release URL base
# ---------------------------------------------------------------------------
REPO="rakeshgangwar/agentpod"
BASE_URL="https://github.com/${REPO}/releases"
if [[ -n "${VERSION:-}" ]]; then
  DOWNLOAD_BASE="${BASE_URL}/download/${VERSION}"; echo "    Pinned version: ${VERSION}"
else
  DOWNLOAD_BASE="${BASE_URL}/latest/download"; echo "    Using latest release"
fi

# ---------------------------------------------------------------------------
# Install dir (system vs user) + binary + apn alias
# ---------------------------------------------------------------------------
if [ "$MODE" = "user" ]; then BIN_DIR="$HOME/.local/bin"; else BIN_DIR="/usr/local/bin"; fi
mkdir -p "$BIN_DIR"
DEST_BIN="$BIN_DIR/agentpod-node"

echo "==> Downloading agentpod-node-${OS}-${ARCH}..."
BINARY_URL="${DOWNLOAD_BASE}/agentpod-node-${OS}-${ARCH}"
if ! curl -fSL --progress-bar -o "$DEST_BIN" "$BINARY_URL"; then
  echo "" >&2
  echo "ERROR: download failed: ${BINARY_URL}" >&2
  echo "       Make sure a release exists for this version/arch:" >&2
  echo "       https://github.com/${REPO}/releases" >&2
  exit 1
fi
chmod 0755 "$DEST_BIN"
ln -sf "$DEST_BIN" "$BIN_DIR/apn"
echo "    Installed to ${DEST_BIN}  (alias: apn)"

# ---------------------------------------------------------------------------
# Enroll — as the user who will RUN the agent, so ~/.config/agentpod-node is
# owned + readable by them.
#  - user mode: already running as that (non-root) user.
#  - system + macOS: sudo preserves $HOME, so enroll as $SUDO_USER (else config is
#    root-owned in the user's dir and `run` as the user can't read it).
#  - system + Linux: the service runs as root, so root-owned config is correct.
# ---------------------------------------------------------------------------
echo "==> Enrolling node with hub at ${HUB_URL}..."
if [ "$MODE" = "system" ] && [ "$OS" = "darwin" ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  sudo -u "$SUDO_USER" "$DEST_BIN" enroll --hub "$HUB_URL" --token "$TOKEN"
else
  "$DEST_BIN" enroll --hub "$HUB_URL" --token "$TOKEN"
fi
echo "    Enrolled."

# ---------------------------------------------------------------------------
# Service / run setup
# ---------------------------------------------------------------------------
path_hint() {
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "NOTE: $BIN_DIR is not on your PATH — add it:"
       echo "        echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.bashrc && export PATH=\"$BIN_DIR:\$PATH\"" ;;
  esac
}

if [ "$MODE" = "user" ]; then
  echo ""
  echo "Done. agentpod-node installed to ${DEST_BIN} (rootless — no sudo used)."
  path_hint
  SVC_OK=0
  if [ "$OS" = "linux" ] && command -v systemctl >/dev/null 2>&1 && systemctl --user daemon-reload >/dev/null 2>&1; then
    UDIR="$HOME/.config/systemd/user"
    mkdir -p "$UDIR"
    cat > "$UDIR/agentpod-node.service" <<EOF
[Unit]
Description=AgentPod node-agent (user service)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${DEST_BIN} run
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    if systemctl --user enable --now agentpod-node >/dev/null 2>&1; then SVC_OK=1; fi
  fi
  echo ""
  if [ "$SVC_OK" = "1" ]; then
    echo "Running as a systemd --user service:"
    echo "  status:  systemctl --user status agentpod-node"
    echo "  logs:    journalctl --user -u agentpod-node -f"
    echo "  To survive logout/reboot, an admin runs once:  sudo loginctl enable-linger $USER"
  else
    echo "To start it now:       apn run"
    echo "Persist without root:  tmux new -s apn 'apn run'   (or)   nohup apn run >~/agentpod-node.log 2>&1 &"
  fi

elif [ "$OS" = "linux" ]; then
  # ---- system + Linux: systemd service ----
  echo "==> Installing systemd service..."
  UNIT_URL="${DOWNLOAD_BASE}/agentpod-node.service"
  UNIT_DEST="/etc/systemd/system/agentpod-node.service"
  if ! curl -fSL --progress-bar -o "$UNIT_DEST" "$UNIT_URL"; then
    echo "" >&2; echo "ERROR: failed to download unit: ${UNIT_URL}" >&2; exit 1
  fi
  chmod 0644 "$UNIT_DEST"
  systemctl daemon-reload
  systemctl enable --now agentpod-node
  echo ""
  echo "Done. agentpod-node is running as a systemd service."
  echo "  status:  systemctl status agentpod-node"
  echo "  logs:    journalctl -u agentpod-node -f"

elif [ "$OS" = "darwin" ]; then
  # ---- system + macOS: no systemd ----
  echo ""
  echo "Done. agentpod-node is installed and enrolled."
  echo "  Run interactively:  apn run"
  echo "  Or set up a launchd plist (LaunchDaemon/LaunchAgent) with"
  echo "    ProgramArguments: [\"${DEST_BIN}\", \"run\"]"
fi
