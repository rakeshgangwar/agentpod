# Node-agent Self-Update Slice 2 (`apn update`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** A tested `internal/selfupdate` package + an `apn update` subcommand that resolves the latest release, verifies its checksum, atomically swaps the binary, and restarts the service.

**Architecture:** One Go package (`internal/selfupdate`) of small injectable functions + a thin `update` subcommand wiring. All node-agent; one implementation task (T1) + driver/user deploy-verify (T2).

**Tech Stack:** Go (stdlib `net/http`, `crypto/sha256`, `os/exec`, `httptest`).

**Spec:** `docs/superpowers/specs/2026-06-30-node-agent-selfupdate-slice2-design.md`.

## Global Constraints

- Node-agent `apps/node-agent`. Gate: `go vet ./...` + `go test ./... -race` + `go build ./...`.
- Repo slug `rakeshgangwar/agentpod`. Asset name `agentpod-node-<GOOS>-<GOARCH>`. Checksums file `SHA256SUMS` (lines `"<hex>  <filename>"`).
- Defaults overridable for tests: API base `https://api.github.com`, download base `https://github.com`.
- Verify SHA-256 **before** swap; keep `.bak`; no auto-rollback.

---

### Task 1: `internal/selfupdate` package + `update` subcommand

**Files:**
- Create: `apps/node-agent/internal/selfupdate/selfupdate.go`, `apps/node-agent/internal/selfupdate/selfupdate_test.go`.
- Modify: `apps/node-agent/cmd/agentpod-node/main.go` (add `update` case + usage).

**Interfaces (produced):**
- `type Options struct { CurrentVersion string; Force, CheckOnly bool; APIBase, DLBase string; HTTPClient *http.Client; RunCommand func(name string, args ...string) error }`
- `type Result struct { CurrentVersion, LatestTag string; Updated bool; Reason string }`
- `func Update(ctx context.Context, opts Options) (Result, error)`

- [ ] **Step 1 — parseSHA256SUMS (RED).** In `selfupdate_test.go`: `parseSHA256SUMS([]byte("abc123  agentpod-node-linux-amd64\ndef  other\n"), "agentpod-node-linux-amd64")` → `"abc123"`, no error; missing asset → error; malformed line → error. `go test ./internal/selfupdate/ -run SHA` → FAIL (undefined).
- [ ] **Step 2 — parseSHA256SUMS (GREEN).** Implement in `selfupdate.go`: split lines, fields; match the second field to `asset`; return the first field. Error if not found. Test → PASS.
- [ ] **Step 3 — assetName + LatestTag (RED).** Test `assetName("linux","amd64")=="agentpod-node-linux-amd64"`. Test `LatestTag` against an `httptest.Server` returning `{"tag_name":"v0.1.2"}` for `/repos/rakeshgangwar/agentpod/releases/latest` → returns `"v0.1.2"`. FAIL.
- [ ] **Step 4 — assetName + LatestTag (GREEN).** `assetName` = `fmt.Sprintf("agentpod-node-%s-%s", goos, goarch)`. `LatestTag(ctx, client, apiBase)` GETs `apiBase+"/repos/rakeshgangwar/agentpod/releases/latest"`, decodes `struct{ TagName string `json:"tag_name"` }`, returns TagName (error on non-200). Test → PASS.
- [ ] **Step 5 — downloadAndVerify (RED).** `httptest.Server` serving: `/rakeshgangwar/agentpod/releases/download/v0.1.2/agentpod-node-linux-amd64` → bytes `"BINARY"`; `/.../v0.1.2/SHA256SUMS` → the real sha256 of `"BINARY"` + "  agentpod-node-linux-amd64". Assert `downloadAndVerify(...)` writes a temp file in destDir whose bytes == "BINARY" and returns its path. Second case: SHA256SUMS has a wrong hash → error returned AND no leftover temp file. FAIL.
- [ ] **Step 6 — downloadAndVerify (GREEN).** Download the asset to `os.CreateTemp(destDir, "agentpod-node-*.tmp")`; download `SHA256SUMS`; `parseSHA256SUMS`; `sha256.New()` over the temp file; compare (hex, constant-time not required). On mismatch/missing: `os.Remove(tmp)` + error. Return the temp path on success. Test → PASS.
- [ ] **Step 7 — swapBinary (RED).** Temp-dir test: write `target` = "OLD" (mode 0755) + a temp "NEW"; `swapBinary(target, tmp)` → `target` bytes == "NEW", mode 0755, `target+".bak"` bytes == "OLD". FAIL.
- [ ] **Step 8 — swapBinary (GREEN).** `os.Chmod(tmp, 0o755)`; `os.Rename(target, target+".bak")` (ignore error if target missing); `os.Rename(tmp, target)`; if that errors, attempt `os.Rename(target+".bak", target)` (rollback) and return the error. Test → PASS.
- [ ] **Step 9 — restartService (RED).** Test with an injected `RunCommand` capturing calls: when a (stubbed) "user unit active" probe succeeds → expects `systemctl --user restart agentpod-node`; else `systemctl restart agentpod-node`. (Model the probe as a RunCommand call to `systemctl --user is-active agentpod-node`; the stub returns nil/err to drive the branch.) FAIL.
- [ ] **Step 10 — restartService (GREEN).** `restartService(run func(...))`: if `run("systemctl","--user","is-active","agentpod-node")==nil` → `run("systemctl","--user","restart","agentpod-node")`; else `run("systemctl","restart","agentpod-node")`. Return a sentinel error if the chosen restart fails so the CLI can print a manual hint. Test → PASS.
- [ ] **Step 11 — Update orchestration (RED).** Using the httptest server via `Options{APIBase,DLBase,HTTPClient}`, a temp install dir (a fake current binary), and a capturing `RunCommand`: (a) `CurrentVersion=="v0.1.2"`, latest `v0.1.2`, not Force → `Result{Updated:false, Reason:"already up to date"}`, no swap; (b) `CurrentVersion=="v0.1.1"`, latest `v0.1.2` → downloads/verifies/swaps (target now "BINARY"), restart invoked, `Result{Updated:true}`; (c) `CheckOnly` with differing versions → `Updated:false`, no swap. FAIL.
- [ ] **Step 12 — Update (GREEN).** Implement: resolve target via `filepath.EvalSymlinks(os.Executable())` **unless** `opts` provides a test target dir (add an unexported `targetPath` override used only by tests, or accept the path through Options for testability — keep it simple: an optional `Options.targetPathForTest`); default HTTPClient/APIBase/DLBase when zero; `LatestTag`; if `tag==CurrentVersion && !Force` → up-to-date result; if `CheckOnly` → comparison result, no change; else `downloadAndVerify`→`swapBinary`→`restartService(opts.RunCommand)`. Default `RunCommand` = `exec.Command(name,args...).Run`. Test → PASS.
- [ ] **Step 13 — `update` subcommand.** In `main.go` add `case "update":` — `flag.NewFlagSet("update",…)` with `--check` + `--force`; call `selfupdate.Update(ctx, selfupdate.Options{CurrentVersion: version, Force: *force, CheckOnly: *check})`; print `current <v>, latest <tag>` then `up to date` / `updated to <tag>, restarting…` / (check) the comparison; non-zero exit on error (print the manual-restart hint on a restart sentinel). Add `update` to the usage string.
- [ ] **Step 14 — gate + commit.** `cd apps/node-agent && go vet ./... && go test ./... -race && go build ./...`. Build + smoke: `go build -ldflags "-X main.version=v0.0.0" -o /tmp/an ./cmd/agentpod-node && /tmp/an update --check` (it will hit real GitHub: expect it to print current v0.0.0 + the real latest tag, no change). Commit: `feat(node): apn update — self-update core (resolve/verify/swap/restart) (self-update slice 2)`

---

### Task 2: Release v0.1.2 + live verification (driver-run + user)

- [ ] Merge `develop`→`main`. Cut tag **`v0.1.2`** → release workflow publishes versioned binaries + `SHA256SUMS` (now including the `update` command).
- [ ] **User installs v0.1.2 on `superchotu`** (the last manual install — binary swap from latest + `systemctl --user restart agentpod-node`). This also delivers F16 + slice-1 version reporting. Confirm the console shows `v0.1.2` + hanuman's gateway Health metrics.
- [ ] **Verify self-update live on superchotu:** `apn update --check` → reports "current v0.1.2, latest v0.1.2 (up to date)". `apn update --force` → re-downloads v0.1.2, verifies checksum, swaps (`.bak` created), restarts; node reconnects (console online); `apn version` still v0.1.2. This proves the full mechanism without needing a newer release.
- [ ] (Optional) confirm a tampered run aborts: not done on prod; covered by unit tests.

## Self-review

- **Spec coverage:** §2 package fns → steps 1-12; §3 CLI → step 13; §4 decisions encoded (GitHub base defaults, verify-before-swap, .bak, user/system restart); §5 testing → the RED/GREEN per fn with httptest + temp dirs + injected RunCommand; §6 live verify → T2. ✓
- **Testability:** every external dep injected (HTTP base URLs, RunCommand, test target path) → no real network/exec in unit tests; step 14 smoke + T2 do the real-world check. ✓
- **No placeholders:** exact signatures, URLs, the swap/restart logic, the test fixtures. ✓
