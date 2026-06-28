package terminal_test

import (
	"strings"
	"testing"
	"time"

	"github.com/rakeshgangwar/agentpod/node-agent/internal/terminal"
)

// readUntil drains ch, accumulating output, until substr is found or a 2s
// timeout fires (at which point it calls t.Fatal).
func readUntil(t *testing.T, ch <-chan []byte, substr string) string {
	t.Helper()
	deadline := time.After(2 * time.Second)
	var acc strings.Builder
	for {
		select {
		case chunk, ok := <-ch:
			if !ok {
				// Channel closed — return whatever we have.
				return acc.String()
			}
			acc.Write(chunk)
			if strings.Contains(acc.String(), substr) {
				return acc.String()
			}
		case <-deadline:
			t.Fatalf("readUntil: timeout waiting for %q; got %q", substr, acc.String())
			return acc.String()
		}
	}
}

func TestOpenAttachReplayAndDetach(t *testing.T) {
	m := terminal.NewManager()
	defer m.Shutdown()

	// /bin/cat echoes stdin to stdout — deterministic, no real shell needed.
	s, err := m.Open("station-1", "/bin/cat", t.TempDir(), 80, 24)
	if err != nil {
		t.Fatal(err)
	}

	ch, unsub := s.Subscribe()
	if err := s.Write([]byte("ping\n")); err != nil {
		t.Fatal(err)
	}
	got := readUntil(t, ch, "ping")
	if !strings.Contains(got, "ping") {
		t.Fatalf("want echo, got %q", got)
	}
	unsub() // detach — session must stay alive

	// Re-open by key returns the SAME session (one-per-station).
	s2, _ := m.Open("station-1", "/bin/cat", t.TempDir(), 80, 24)
	if s2.ID != s.ID {
		t.Fatalf("expected same session, got %s vs %s", s2.ID, s.ID)
	}

	// Re-subscribe replays scrollback (the earlier "ping" echo).
	ch2, unsub2 := s2.Subscribe()
	defer unsub2()
	replay := readUntil(t, ch2, "ping")
	if !strings.Contains(replay, "ping") {
		t.Fatalf("expected scrollback replay, got %q", replay)
	}
}

func TestCloseReapsChild(t *testing.T) {
	m := terminal.NewManager()
	defer m.Shutdown()

	s, _ := m.Open("k", "/bin/cat", t.TempDir(), 80, 24)
	if err := m.Close(s.ID); err != nil {
		t.Fatal(err)
	}
	if _, ok := m.Get(s.ID); ok {
		t.Fatal("session should be gone after Close")
	}
}
