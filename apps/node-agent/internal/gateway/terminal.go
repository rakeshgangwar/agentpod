package gateway

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"sync"

	"github.com/rakeshgangwar/agentpod/node-agent/internal/terminal"
)

// WorkspaceResolver maps a station key to the absolute path of its workspace
// directory (used as the cwd when spawning a terminal session).
type WorkspaceResolver interface {
	Workspace(key string) (string, error)
}

// WorkspaceFunc is a functional adapter for WorkspaceResolver.
type WorkspaceFunc func(key string) (string, error)

// Workspace implements WorkspaceResolver.
func (f WorkspaceFunc) Workspace(key string) (string, error) { return f(key) }

// attachState tracks an active term.attach subscription.
type attachState struct {
	sessionID string
	unsub     func()
}

// terminalHandler wraps an inner Handler and adds routing for the three
// terminal verbs (term.open, term.attach, term.close) plus inbound
// input/resize frame handling via the FrameHandler interface.
type terminalHandler struct {
	inner    Handler
	resolver WorkspaceResolver
	mgr      *terminal.Manager

	attachMu sync.Mutex
	attaches map[string]*attachState // keyed by attach request ID
}

// NewTerminalHandler wraps inner with terminal verb and input/resize support.
//   - resolver provides workspace path lookup for term.open.
//   - mgr is shared across the lifetime of the gateway connection.
//
// The returned handler implements both Handler and FrameHandler.
func NewTerminalHandler(inner Handler, resolver WorkspaceResolver, mgr *terminal.Manager) Handler {
	return &terminalHandler{
		inner:    inner,
		resolver: resolver,
		mgr:      mgr,
		attaches: make(map[string]*attachState),
	}
}

// Handle routes term.* verbs to the local handlers and delegates everything
// else to the wrapped inner handler.
func (h *terminalHandler) Handle(
	ctx context.Context,
	verb string,
	params json.RawMessage,
	emit func(seq int, chunk string, eof bool, enc string) error,
) (any, bool, error) {
	switch verb {
	case "term.open":
		return h.handleTermOpen(params)
	case "term.attach":
		return h.handleTermAttach(ctx, params, emit)
	case "term.close":
		return h.handleTermClose(params)
	default:
		return h.inner.Handle(ctx, verb, params, emit)
	}
}

// handleTermOpen resolves the workspace for key, spawns (or reuses) a PTY
// session, and returns {sessionId}.
func (h *terminalHandler) handleTermOpen(params json.RawMessage) (any, bool, error) {
	var p struct {
		Key  string `json:"key"`
		Cols uint16 `json:"cols"`
		Rows uint16 `json:"rows"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, false, fmt.Errorf("term.open: bad params: %w", err)
	}

	workspace, err := h.resolver.Workspace(p.Key)
	if err != nil {
		return nil, false, fmt.Errorf("term.open: workspace: %w", err)
	}

	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}

	sess, err := h.mgr.Open(p.Key, shell, workspace, p.Cols, p.Rows)
	if err != nil {
		return nil, false, fmt.Errorf("term.open: %w", err)
	}

	return map[string]any{"sessionId": sess.ID}, false, nil
}

// handleTermAttach subscribes to the session's output stream and forwards each
// chunk as a base64-encoded stream frame. It blocks until the context is
// cancelled (detach via cancel frame) or the session ends. On context
// cancellation the subscriber is removed WITHOUT closing the session.
func (h *terminalHandler) handleTermAttach(
	ctx context.Context,
	params json.RawMessage,
	emit func(seq int, chunk string, eof bool, enc string) error,
) (any, bool, error) {
	var p struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, true, fmt.Errorf("term.attach: bad params: %w", err)
	}

	sess, ok := h.mgr.Get(p.SessionID)
	if !ok {
		return nil, true, fmt.Errorf("term.attach: session not found: %s", p.SessionID)
	}

	// Extract the attach request ID embedded in ctx by serve() so we can key
	// the attach map and allow input/resize frames to find this session.
	reqID, _ := ctx.Value(reqIDKey{}).(string)

	ch, unsub := sess.Subscribe()

	h.attachMu.Lock()
	h.attaches[reqID] = &attachState{sessionID: p.SessionID, unsub: unsub}
	h.attachMu.Unlock()

	defer func() {
		h.attachMu.Lock()
		delete(h.attaches, reqID)
		h.attachMu.Unlock()
	}()

	seq := 0
loop:
	for {
		select {
		case chunk, ok := <-ch:
			if !ok {
				// Session ended; subscriber channel closed.
				break loop
			}
			encoded := base64.StdEncoding.EncodeToString(chunk)
			if err := emit(seq, encoded, false, "base64"); err != nil {
				// Hub disconnected or context cancelled mid-write — detach.
				unsub()
				break loop
			}
			seq++
		case <-ctx.Done():
			// cancel frame received: detach this subscriber, do NOT close the
			// session (PTY keeps running; another client can re-attach).
			unsub()
			break loop
		}
	}

	return nil, true, nil
}

// handleTermClose terminates the named session and removes it from the manager.
func (h *terminalHandler) handleTermClose(params json.RawMessage) (any, bool, error) {
	var p struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, false, fmt.Errorf("term.close: bad params: %w", err)
	}

	if err := h.mgr.Close(p.SessionID); err != nil {
		return nil, false, fmt.Errorf("term.close: %w", err)
	}

	return map[string]any{"ok": true}, false, nil
}

// HandleFrame implements FrameHandler for inbound terminal input/resize frames.
// The id is the attach request ID that was used in the corresponding term.attach req.
func (h *terminalHandler) HandleFrame(frameType, id string, raw json.RawMessage) error {
	h.attachMu.Lock()
	st, ok := h.attaches[id]
	h.attachMu.Unlock()
	if !ok {
		return nil // no active attach for this id — ignore
	}

	sess, ok := h.mgr.Get(st.sessionID)
	if !ok {
		return nil // session has gone away
	}

	switch frameType {
	case "input":
		var f struct {
			Data string `json:"data"`
		}
		if err := json.Unmarshal(raw, &f); err != nil {
			return fmt.Errorf("input: bad frame: %w", err)
		}
		data, err := base64.StdEncoding.DecodeString(f.Data)
		if err != nil {
			return fmt.Errorf("input: bad base64: %w", err)
		}
		return sess.Write(data)

	case "resize":
		var f struct {
			Cols uint16 `json:"cols"`
			Rows uint16 `json:"rows"`
		}
		if err := json.Unmarshal(raw, &f); err != nil {
			return fmt.Errorf("resize: bad frame: %w", err)
		}
		return sess.Resize(f.Cols, f.Rows)
	}

	return nil
}
