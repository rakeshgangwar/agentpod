package gateway

import (
	"context"
	"encoding/json"
	"os"
	"time"

	"github.com/rakeshgangwar/agentpod/node-agent/internal/selfupdate"
)

// updateHandler wraps an inner Handler and intercepts the "update" verb to
// trigger an in-process self-update via selfupdate.Apply, then exits so that
// the system supervisor (e.g. systemd Restart=always) can start the new binary.
type updateHandler struct {
	inner   Handler
	version string

	// The following fields are unexported and defaulted by NewUpdateHandler.
	// They are overridable in tests for injection.
	apply func(context.Context, selfupdate.Options) (selfupdate.Result, error)
	exit  func(int)
	delay time.Duration
}

// NewUpdateHandler wraps inner with a handler that intercepts the "update" verb.
// When "update" is received the handler calls selfupdate.Apply (resolve latest
// release, download, verify, swap) and then exits — the supervisor restarts the
// process with the new binary. All other verbs are delegated to inner.
func NewUpdateHandler(inner Handler, version string) Handler {
	return &updateHandler{
		inner:   inner,
		version: version,
		apply:   selfupdate.Apply,
		exit:    os.Exit,
		delay:   time.Second,
	}
}

// Handle intercepts "update" and delegates all other verbs to the inner handler.
func (h *updateHandler) Handle(
	ctx context.Context,
	verb string,
	p json.RawMessage,
	emit func(seq int, chunk string, eof bool, enc string) error,
) (any, bool, error) {
	if verb != "update" {
		return h.inner.Handle(ctx, verb, p, emit)
	}

	res, err := h.apply(ctx, selfupdate.Options{CurrentVersion: h.version})
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}, true, nil
	}

	// Respond to the hub before exiting so it can mark the node as updating.
	// The goroutine gives the dispatcher time to write the response frame.
	go func() {
		time.Sleep(h.delay)
		h.exit(0)
	}()

	return map[string]any{"ok": true, "updating": true, "tag": res.LatestTag}, true, nil
}

// HandleFrame forwards inbound terminal input/resize frames to the inner handler
// when it implements FrameHandler. The dispatcher (serve) routes such frames via
// a type assertion on the OUTERMOST handler; without this forwarder, wrapping a
// terminalHandler in updateHandler would erase the FrameHandler interface and
// every keystroke would be silently dropped (terminal connects but ignores
// input). Returns nil when the inner handler has no frame support.
func (h *updateHandler) HandleFrame(frameType, id string, raw json.RawMessage) error {
	if fh, ok := h.inner.(FrameHandler); ok {
		return fh.HandleFrame(frameType, id, raw)
	}
	return nil
}
