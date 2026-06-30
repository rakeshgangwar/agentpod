# Node-agent Self-Update — Slice 2: Self-Update Core + `apn update` CLI (Design Spec)

**Status:** Approved (brainstorm 2026-06-30). Second of three slices (milestone #12; #180). Builds on Slice 1 (version + `SHA256SUMS`). Slice 3 (hub-orchestrated) follows.
**Branch:** `develop` (merge `develop`→`main`).
**Context:** Replace the manual curl/chmod/restart re-install with one command — `apn update` — that resolves the latest release, downloads the right binary, verifies its checksum, atomically swaps it, and restarts the service.

## 1. Goal & Scope

A self-contained, tested `internal/selfupdate` package + an `update` subcommand. **Operator-run CLI** path only — the running service does not self-replace (that's Slice 3's hub-triggered re-exec). Linux + macOS; systemd (user/system) restart with a printed-command fallback.

## 2. Package: `apps/node-agent/internal/selfupdate`

One package, small focused functions (all testable via an injectable HTTP base URL + temp dirs):

- `LatestTag(ctx, client *http.Client, apiBase string) (tag string, err error)` — GET `<apiBase>/repos/rakeshgangwar/agentpod/releases/latest`, parse JSON `{"tag_name": "..."}`. `apiBase` defaults to `https://api.github.com` (overridable in tests).
- `assetName(goos, goarch string) string` → `agentpod-node-<goos>-<goarch>`.
- `downloadAndVerify(ctx, client, dlBase, tag, asset, destDir string) (tmpPath string, err error)` — download `<dlBase>/rakeshgangwar/agentpod/releases/download/<tag>/<asset>` to a temp file in `destDir`; download `SHA256SUMS` from the same release; parse it (lines `"<hex>  <filename>"`), find `asset`'s expected hash; compute the temp file's SHA-256; **return an error (and delete the temp file) on mismatch or missing entry**. `dlBase` defaults to `https://github.com`.
- `parseSHA256SUMS(data []byte, asset string) (wantHex string, err error)` — pure; tested directly.
- `swapBinary(targetPath, tmpPath string) error` — `chmod 0755` the temp; back up `targetPath`→`targetPath+".bak"` (rename); atomically `os.Rename(tmpPath, targetPath)` (temp is in the same dir → same filesystem). On rename failure, restore the `.bak`. Keep `.bak` on success.
- `restartService() error` — detect the unit scope and run `systemctl --user restart agentpod-node` if the user unit is active (`systemctl --user is-active agentpod-node` succeeds), else `systemctl restart agentpod-node`; if neither systemctl path works, return a sentinel so the CLI prints "restart the service manually: …".
- `Update(ctx, opts) (UpdateResult, error)` — orchestrates: resolve target binary path (`filepath.EvalSymlinks(os.Executable())`) + its dir; LatestTag; compare to `currentVersion` (passed in); if equal and not `Force` → `UpdateResult{Updated:false, Reason:"already up to date"}`; else download+verify→swap→restart. `opts` carries `CurrentVersion`, `Force`, `CheckOnly`, and (for tests) `APIBase`/`DLBase`/`HTTPClient`.

## 3. CLI: `update` subcommand (`cmd/agentpod-node/main.go`)

Add `case "update":` to the existing `enroll|run|detect|version` switch. Flags (`flag.NewFlagSet`): `--check` (resolve + report current/latest, no changes), `--force` (swap even if same version). Pass the package-level `version` as `CurrentVersion`. Print human output: "current vX, latest vY", then "up to date" / "updated to vY, restarting…" / on `--check` just the comparison. Exit non-zero on error. Update the usage string to include `update`.

## 4. Decisions (from brainstorm)

- **Latest source:** GitHub releases API direct (`api.github.com`). No hub dependency; 60/hr unauthenticated limit is fine for manual updates.
- **Restart:** operator-run `apn update` restarts the service (user/system auto-detected); the running service does **not** self-update in this slice.
- **Safety:** verify SHA-256 **before** swap (abort on mismatch); keep `.bak` for manual rollback; **no** auto-rollback-on-failed-restart (YAGNI).

## 5. Testing

- `parseSHA256SUMS` — table test (correct line, missing asset, malformed).
- `LatestTag` + `downloadAndVerify` — `httptest.Server` serving a fake releases-latest JSON + a fake binary + a matching/again-mismatching `SHA256SUMS`; assert success path + that a checksum mismatch errors and leaves no swapped file.
- `swapBinary` — temp-dir test: a fake "old" binary file + a "new" temp; assert the swap replaces content, `.bak` holds the old bytes, mode is 0755; simulate a rename failure path → `.bak` restored.
- `restartService` — refactor the exec into an injectable runner (a `func(name string, args ...string) error` field) so the test asserts the command **construction** (user vs system) without executing systemctl.
- `Update` — wire the httptest server via `opts`; assert "already up to date" when versions match, and the full path when they differ (against a temp install dir, injected runner).
- Gate: `go vet ./...` + `go test ./... -race` + `go build ./...`.

## 6. Risks & verification

- **Self-replacement of a running binary:** safe on Linux/macOS (the running process keeps its open inode; the path gets the new file; restart picks it up). The swap targets `EvalSymlinks(os.Executable())` so the `apn` symlink is preserved.
- **Wrong target path** (run via `apn` symlink): `EvalSymlinks` resolves to the real `agentpod-node`; tested.
- **Partial download / bad binary:** checksum-verify-before-swap guarantees a bad fetch never replaces the live binary; temp file deleted on failure.
- **Restart scope mis-detection:** the user/system probe + the printed fallback means worst case the operator restarts manually (binary already swapped).
- **Live verification:** on `superchotu` run `apn update --check` (reports current/latest), then `apn update` → confirms swap + `apn version` == latest + the service reconnects (console shows online). Because superchotu is currently pre-v0.1.1, this same step doubles as the pending F16 / slice-1 live confirmation. Keep the previous binary as `.bak` for rollback.

## 7. Success criteria

`apn update --check` reports current vs latest without changes; `apn update` downloads + verifies + swaps + restarts, after which `apn version` prints the latest tag and the node reconnects; a tampered/mismatched `SHA256SUMS` aborts the update with no swap; `.bak` is retained; all `selfupdate` unit tests + go vet/build green. Ready for Slice 3 (hub-triggered `update` verb reusing this package).
