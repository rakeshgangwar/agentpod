package gateway

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/rakeshgangwar/agentpod/node-agent/internal/selfupdate"
)

// stubInner is a minimal Handler for delegation tests.
type stubInner struct {
	calledWith string
	result     any
}

func (s *stubInner) Handle(ctx context.Context, verb string, p json.RawMessage, emit func(int, string, bool, string) error) (any, bool, error) {
	s.calledWith = verb
	return s.result, false, nil
}

func TestUpdateHandler_UpdateVerb(t *testing.T) {
	// exitCh receives the exit code when the goroutine fires; buffered so the
	// goroutine never blocks even if the test times out.
	exitCh := make(chan int, 1)

	fakeApply := func(_ context.Context, opts selfupdate.Options) (selfupdate.Result, error) {
		return selfupdate.Result{LatestTag: "v0.1.3", Updated: true}, nil
	}

	h := &updateHandler{
		inner:   HandlerFunc(func(_ context.Context, verb string, _ json.RawMessage, _ func(int, string, bool, string) error) (any, bool, error) {
			t.Errorf("inner.Handle called unexpectedly for verb=%q", verb)
			return nil, false, nil
		}),
		version: "v0.1.2",
		apply:   fakeApply,
		exit:    func(code int) { exitCh <- code },
		delay:   0, // fire immediately
	}

	result, handled, err := h.Handle(context.Background(), "update", json.RawMessage(`{}`), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !handled {
		t.Error("expected handled=true")
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any result, got %T", result)
	}
	if m["ok"] != true {
		t.Errorf("ok: got %v want true", m["ok"])
	}
	if m["updating"] != true {
		t.Errorf("updating: got %v want true", m["updating"])
	}
	if m["tag"] != "v0.1.3" {
		t.Errorf("tag: got %v want \"v0.1.3\"", m["tag"])
	}

	// Wait for the exit goroutine; delay=0 so it fires immediately after Handle
	// returns, but we still need to yield so the scheduler can run it.
	select {
	case code := <-exitCh:
		if code != 0 {
			t.Errorf("exit code: got %d want 0", code)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for exit goroutine")
	}
}

func TestUpdateHandler_DelegatesNonUpdate(t *testing.T) {
	inner := &stubInner{result: map[string]any{"pong": true}}

	h := &updateHandler{
		inner:   inner,
		version: "v0.1.2",
		apply:   selfupdate.Apply, // must not be called
		exit:    func(code int) { t.Errorf("exit called unexpectedly with code %d", code) },
		delay:   0,
	}

	result, _, err := h.Handle(context.Background(), "ping", json.RawMessage(`{}`), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if inner.calledWith != "ping" {
		t.Errorf("inner verb: got %q want \"ping\"", inner.calledWith)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any from inner, got %T", result)
	}
	if m["pong"] != true {
		t.Errorf("pong: got %v want true", m["pong"])
	}
}
