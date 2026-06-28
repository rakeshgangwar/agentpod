#!/usr/bin/env bash
# install-node-agent.test.sh — fake-harness test for install-node-agent.sh
#
# Puts fake `agentpod-node` and `systemctl` on PATH, redirects BIN_DIR and
# UNIT_DIR to a temp directory, then runs the installer and asserts:
#   1. The binary was copied into BIN_DIR.
#   2. `enroll --hub X --token Y` was invoked.
#   3. The systemd unit was installed into UNIT_DIR.
#   4. `systemctl daemon-reload` was called.
#   5. `systemctl enable --now agentpod-node` was called.
#
# Run without root (all paths are in /tmp).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER="${SCRIPT_DIR}/install-node-agent.sh"
SERVICE_FILE="${SCRIPT_DIR}/../deploy/agentpod-node.service"

PASS=0
FAIL=0

pass() { echo "  PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_contains() {
  local label="$1" needle="$2" file="$3"
  if grep -qF -- "$needle" "$file" 2>/dev/null; then
    pass "$label"
  else
    fail "$label — expected '${needle}' in ${file}"
    echo "       Actual content:"
    cat "$file" 2>/dev/null || echo "       (file missing)"
  fi
}

# ---------------------------------------------------------------------------
# Set up temp workspace
# ---------------------------------------------------------------------------
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAKE_BIN="${WORK}/fake-bin"
BIN_DIR="${WORK}/usr-local-bin"
UNIT_DIR="${WORK}/systemd-system"
LOG_DIR="${WORK}/logs"
mkdir -p "$FAKE_BIN" "$BIN_DIR" "$UNIT_DIR" "$LOG_DIR"

# Fake agentpod-node: logs its args, always succeeds.
cat > "${FAKE_BIN}/agentpod-node" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "${LOG_DIR}/agentpod-node.log"
exit 0
FAKE
# Inject LOG_DIR into the fake binary.
sed -i.bak "s|\${LOG_DIR}|${LOG_DIR}|g" "${FAKE_BIN}/agentpod-node"
rm -f "${FAKE_BIN}/agentpod-node.bak"
chmod +x "${FAKE_BIN}/agentpod-node"

# Fake systemctl: logs its args, always succeeds.
cat > "${FAKE_BIN}/systemctl" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "${LOG_DIR}/systemctl.log"
exit 0
FAKE
sed -i.bak "s|\${LOG_DIR}|${LOG_DIR}|g" "${FAKE_BIN}/systemctl"
rm -f "${FAKE_BIN}/systemctl.bak"
chmod +x "${FAKE_BIN}/systemctl"

# Also put a "source binary" so the installer's install step has something to copy.
cp "${FAKE_BIN}/agentpod-node" "${WORK}/agentpod-node"

# ---------------------------------------------------------------------------
# Fake `id` so the root-guard passes without sudo.
# ---------------------------------------------------------------------------
cat > "${FAKE_BIN}/id" <<'FAKE'
#!/usr/bin/env bash
if [[ "${1:-}" == "-u" ]]; then echo 0; else /usr/bin/id "$@"; fi
FAKE
chmod +x "${FAKE_BIN}/id"

# ---------------------------------------------------------------------------
# Run the installer with fakes on PATH, overriding dirs.
# ---------------------------------------------------------------------------
HUB_URL="https://hub.test.example"
TOKEN="tok-abc-123"

export PATH="${FAKE_BIN}:$PATH"
export BIN_DIR UNIT_DIR
export UNIT_SRC="${SERVICE_FILE}"

# Run from WORK so ./agentpod-node is found by the installer.
(cd "$WORK" && bash "$INSTALLER" "$HUB_URL" "$TOKEN")

# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------
echo ""
echo "Running assertions..."

# 1. Binary copied into BIN_DIR
if [[ -f "${BIN_DIR}/agentpod-node" ]]; then
  pass "binary installed to BIN_DIR"
else
  fail "binary missing from BIN_DIR (${BIN_DIR}/agentpod-node)"
fi

# 2. enroll called with --hub and --token
ENROLL_LOG="${LOG_DIR}/agentpod-node.log"
assert_contains "enroll invoked"       "enroll"          "$ENROLL_LOG"
assert_contains "enroll --hub flag"    "--hub"           "$ENROLL_LOG"
assert_contains "enroll hub URL"       "$HUB_URL"        "$ENROLL_LOG"
assert_contains "enroll --token flag"  "--token"         "$ENROLL_LOG"
assert_contains "enroll token value"   "$TOKEN"          "$ENROLL_LOG"

# 3. Unit file installed into UNIT_DIR
if [[ -f "${UNIT_DIR}/agentpod-node.service" ]]; then
  pass "unit file installed to UNIT_DIR"
else
  fail "unit file missing from UNIT_DIR (${UNIT_DIR}/agentpod-node.service)"
fi

# 4. systemctl daemon-reload
SCTL_LOG="${LOG_DIR}/systemctl.log"
assert_contains "systemctl daemon-reload"    "daemon-reload"          "$SCTL_LOG"

# 5. systemctl enable --now
assert_contains "systemctl enable --now"     "enable --now agentpod-node" "$SCTL_LOG"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "Results: ${PASS} passed, ${FAIL} failed."

if [[ $FAIL -gt 0 ]]; then
  echo "FAIL"
  exit 1
fi
echo "PASS"
