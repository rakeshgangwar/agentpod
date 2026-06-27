package descriptor

import (
	"os"
	"path/filepath"
	"testing"
)

// buildCodexFixtureEmpty creates a temp ~/.codex home with no session/history
// data, verifying that Detect() returns an empty slice (declaration fallback).
func buildCodexFixtureEmpty(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	home := filepath.Join(root, ".codex")
	if err := os.MkdirAll(home, 0o755); err != nil {
		t.Fatalf("MkdirAll codex home: %v", err)
	}
	// Write a config.toml so the home looks real but has no history.
	_ = os.WriteFile(filepath.Join(home, "config.toml"), []byte("[model]\nname = \"o4-mini\"\n"), 0o644)
	return home
}

// --- Detect (empty history) ---

func TestCodexDetect_NoHistoryReturnsEmpty(t *testing.T) {
	home := buildCodexFixtureEmpty(t)
	d := NewCodex(home)

	stations, err := d.Detect()
	if err != nil {
		t.Fatalf("Detect: %v", err)
	}
	// When no project history is present, Detect must return empty so the
	// declaration-fallback path is used (leaf stations added via declaration).
	if len(stations) != 0 {
		t.Fatalf("expected 0 stations when no history, got %d: %+v", len(stations), stations)
	}
}

func TestCodexDetect_MissingHomeReturnsEmpty(t *testing.T) {
	d := NewCodex("/nonexistent/codex/home/path")
	stations, err := d.Detect()
	if err != nil {
		t.Fatalf("Detect on missing home: %v", err)
	}
	if len(stations) != 0 {
		t.Fatalf("expected empty stations for missing home, got %d", len(stations))
	}
}

func TestCodexHarness(t *testing.T) {
	d := NewCodex("")
	if d.Harness() != "codex" {
		t.Errorf("Harness: want codex, got %s", d.Harness())
	}
}
