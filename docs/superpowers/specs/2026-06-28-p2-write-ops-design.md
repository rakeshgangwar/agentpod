# P2 — Write Operations & Durable Terminal (Design Spec)

**Status:** Approved (brainstorm 2026-06-28). Single phase, terminal-first.
**Builds on:** the read-only base shipped in P0/P1 (`docs/superpowers/specs/2026-06-21-agentpod-fleet-console-design.md`) and the web console shell (P2.0).
**Branch:** `redesign/fleet-console`.

## 1. Goal & Scope

Turn the AgentPod console from **read-only observation** into a **facilities console** where a human can *act* on a station: open a shell, edit/write files, edit configs safely, start/stop the harness, and clean up — all gated by a uniform safety model.

**In scope (5 capability areas):**
1. **Durable terminal** — an interactive shell per station, surviving console reload / network blips, with scrollback replay. *Centerpiece, built first.*
2. **Filesystem writes** — write, mkdir, move/rename, delete.
3. **Config edit** — read → edit → backup → write, with a diff view. (No new verbs; composed from fs.read + fs.write{backup} + a client diff.)
4. **Lifecycle** — start/stop/restart, per-harness (only where it applies).
5. **Cleanup** — remove caches/logs/artifacts, with a dry-run plan.

**Out of scope (explicit):**
- Surviving a node-agent **restart/crash** (Go-native PTY dies with its parent; a tmux backend is a *later, optional* enhancement — see §3).
- Multiple concurrent terminals per station (one per station for now; the protocol carries a `sessionId` so this can grow later).
- Process-attach terminals (wiring into a *running agent's* stdin/TTY) — that is kaambaan's "talk to the agent" territory, and is fragile/dangerous. A P2 terminal is always a **fresh shell**.
- Any non-human automation surface for mutations. P2 mutations are **human-driven only**.

## 2. Safety Model (cross-cutting — applies to every mutation)

Defense in depth, four layers:

1. **Path-jail (node).** All `fs.*` operations are confined to the station's `workspacePath`. Reject `..` traversal, symlink escapes, and absolute paths outside the jail. The node is the last line of defense regardless of what the hub/console send.
2. **Capability-gate (hub).** The hub rejects a verb if the target station did not advertise the matching capability (`fs.write`, `lifecycle`, `cleanup`, `terminal`).
3. **Audit-log (hub).** Every mutation writes a `station_audit` row *before* dispatch and records the result. Surfaced as a per-station **Activity** view. Terminal **keystrokes are never logged** — only the fact that a terminal was opened/closed.
4. **Tiered confirm (console).**
   - *Reversible-ish* (fs.write, config write — which always take a timestamped backup first) → **plain confirm** dialog.
   - *Irreversible / bulk* (recursive delete, cleanup apply, lifecycle stop/restart of a running agent) → **type-to-confirm** (type the station name or path).

Backups: `fs.write` accepts a `backup` flag; when set, the node copies the existing file to `<path>.<RFC3339>.bak` before writing and returns the backup path. Used by the config editor.

## 3. Durable Terminal

**Mechanism: Go-native PTY + in-daemon ring buffer** (chosen over tmux/dtach to avoid an external dependency on every host — essential for "attach to runtimes wherever they run").

- The node-agent owns an `internal/terminal.SessionManager`: a map of live sessions keyed by `sessionId`, plus a station→session index (one per station).
- Each session: a `creack/pty` PTY running the host user's `$SHELL` (fallback `/bin/sh`) with `cwd = station.workspacePath`; a **ring buffer** (~256 KB) holding recent output for scrollback; a set of subscribers for live output fan-out.
- **Detach** (console closes / disconnects): remove the subscriber; the PTY and ring buffer **stay alive**. **Reattach**: replay the ring buffer, then live-stream.
- **Lifetime:** a session lives until `term.close`, the node-agent stops, or an idle-detached timeout (default: keep-alive; configurable). Killing the PTY reaps the child.
- **Survives:** console reload, navigation, network blips, hub restart. **Does not survive:** node-agent restart/crash, host reboot. (A future optional tmux backend would add restart durability without changing the protocol.)

## 4. Protocol Extension (`packages/contract`)

**Capability enum** adds: `terminal`, `fs.write`, `lifecycle`, `cleanup`.

**Message union** adds two hub→node frames:
- `input`  — `{ type:"input", id, data }` — stdin bytes (base64), `id` = the `term.attach` request id.
- `resize` — `{ type:"resize", id, cols, rows }`.

`StreamMsg` gains optional `enc: "utf8" | "base64"` (default `utf8`); terminal output uses `base64` (binary-safe). `logs.tail` stays `utf8` — unchanged.

**New verbs** (`VERB_PARAMS` / `VERB_RESULTS`):

| verb | params | result |
|---|---|---|
| `fs.write` | `{ key, path, content, encoding, backup? }` | `{ bytesWritten, backupPath? }` |
| `fs.mkdir` | `{ key, path }` | `{ ok }` |
| `fs.move` | `{ key, from, to }` | `{ ok }` |
| `fs.delete` | `{ key, path, recursive? }` | `{ ok }` |
| `lifecycle` | `{ key, action: "start"\|"stop"\|"restart" }` | `StationHealth` (post-action) |
| `cleanup.plan` | `{ key }` | `{ items: [{path,size,kind}], totalBytes }` |
| `cleanup.apply` | `{ key, paths: string[] }` | `{ removedBytes }` |
| `term.open` | `{ key, cols, rows }` | `{ sessionId }` |
| `term.attach` | `{ sessionId }` | *(stream)* scrollback + live output |
| `term.close` | `{ sessionId }` | `{ ok }` |

`term.open` is idempotent per station: if a live session exists for the key, it returns that `sessionId`.

## 5. node-agent (Go)

- **`internal/terminal/`** — `SessionManager`, `Session` (PTY + ring buffer + subscribers), open/attach/input/resize/close. Reaps children on close/stop.
- **`internal/fsops/`** (or descriptor-level) — generic, path-jailed `Write/Mkdir/Move/Delete` bounded to `workspacePath`.
- **Descriptor interface** gains *optional* capability interfaces — `Writer`, `Lifecycle`, `Cleaner`. A descriptor that implements one advertises the matching capability in `detect`. `fs.*` is generic (node-level, not per-harness); `lifecycle`/`cleanup` are descriptor-specific.
  - **Lifecycle (thin viable):** `stop` signals the detected running PID (SIGTERM, escalate to SIGKILL after a grace period); `start`/`restart` run a **descriptor-configured command** (e.g. from node config / harness descriptor). Where no start command is known, only `stop` is offered. Refinable per harness later.
  - **Cleanup:** the descriptor enumerates cleanable paths (caches, logs, tmp, stale workspaces) with sizes for the plan; `apply` removes the given paths (still path-jailed).
- **`gateway/dispatch`** — handle the new verbs and route `input`/`resize` frames to the `SessionManager` by `id`.

## 6. hub (Bun/Hono)

- **Terminal bridge** — a new console↔hub **WebSocket** at `GET /api/stations/:id/terminal` (SSE is one-way and cannot carry stdin). On upgrade: authenticate the Better Auth cookie; resolve station→node via the registry; send `term.open` then `term.attach` over the node gateway WS through the broker; then **pump**: console→hub frames (`input`/`resize`) down to the node, node `stream` frames up to the console. On console disconnect, stop streaming but leave the node session alive (detach).
- **Write routes** (REST) — `fs.write/mkdir/move/delete`, `lifecycle`, `cleanup.plan|apply`. Each: authenticate → **capability-gate** → **write audit row** → broker→node → record result → respond.
- **Audit** — Drizzle migration `station_audit { id, userId, nodeId, stationKey, verb, paramsSummary jsonb, result text, error text?, createdAt }`; `GET /api/stations/:id/activity` to list.

## 7. console (Svelte)

- **Terminal panel** (new station tab) — `xterm.js` + fit addon over the terminal WS; base64-decodes output, sends input/resize; reattaches on reconnect.
- **File browser → writable** — edit (Monaco or textarea), new file/folder, rename, delete; actions behind the tiered confirm.
- **Config edit** — the file editor with a **diff view** (edited buffer vs current on-disk) before saving; save uses `fs.write{backup:true}`.
- **Lifecycle controls** — start/stop/restart on the Health panel, shown only when the station advertises `lifecycle`; stop/restart use type-to-confirm.
- **Cleanup** — an action that shows the dry-run plan (items + sizes), then type-to-confirm → apply.
- **Shared components** — `ConfirmDialog` (plain) + `TypeToConfirmDialog`; per-station **Activity** view backed by `/activity`.

## 8. Build Order (single phase, terminal-first)

1. **Protocol** — capabilities, verbs, `input`/`resize` frames, `StreamMsg.enc`.
2. **node terminal** — `SessionManager` (PTY + ring + fan-out) + gateway `input`/`resize`.
3. **hub terminal WS bridge** — console-facing WS + broker pump.
4. **console terminal panel** — xterm.js. *(terminal works end-to-end here.)*
5. **audit** — `station_audit` table + helper + `/activity`.
6. **fs writes** — node path-jailed `fs.write/mkdir/move/delete` + hub routes + console editor/file actions + confirm dialogs.
7. **config edit** — diff view + backup (UI on top of #6).
8. **lifecycle** — descriptor methods (Hermes/OpenClaw) + hub route + Health controls.
9. **cleanup** — descriptor plan/apply + hub routes + console dry-run UI.
10. **Activity view** — console.

## 9. Testing

- **contract** — zod parse/round-trip for new verbs + frames.
- **node-agent (Go)** — `SessionManager` (open/attach replay/detach-keepalive/close-reap), path-jail rejection cases (`..`, symlink, absolute escape), fs ops, cleanup plan sizing. PTY tests use a fake/echo command where a full shell is awkward.
- **hub** — terminal-bridge pump (fake node WS), capability-gate rejection, audit row written on each mutation, cleanup plan/apply correlation. Integration suites apply Drizzle migrations (per the P1 `ensurePgMigrations` helper) against the local docker postgres on `:5434` (never the SSH-tunnel DBs).
- **console** — store/component vitest for the terminal client (mock WS), confirm dialogs (plain + type-to-confirm gating), diff view.
- **visual E2E** — drive a real terminal end-to-end (open shell on a station, run a command, reload → reattach + scrollback), an fs write + a config edit-with-backup, against the real fleet; screenshots + runbook (as in P2.0).

## 10. Risks & Open Items

- **Lifecycle is harness-specific and fuzzy.** The thin-viable model (PID-signal stop; configured start/restart command) may be all that's reliable initially; refine per harness as we learn each launch mechanism. Built last for this reason.
- **Cross-site cookie on the terminal WS** — the WS upgrade carries the cookie same-site (localhost ok); remote/hosted hubs hit the same SameSite constraint tracked in #71. Note in the terminal-bridge task.
- **Binary/encoding** — terminal output is base64 over `StreamMsg`; ensure no utf8 assumptions leak into the logs path.
- **Idle terminal reaping** — default keep-alive; revisit if orphaned shells become a resource concern.
- **Logs volume (#70)** — not P2, but the same SSE/stream path; keep the terminal stream bounded (ring buffer) so it doesn't repeat that issue.
