package descriptor

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMatrixIDFromProfile(t *testing.T) {
	dir := t.TempDir()
	// auth.json holds user_id + a token; we must extract ONLY user_id.
	if err := os.WriteFile(filepath.Join(dir, "auth.json"), []byte(`{"user_id":"@analyst-echo:id.agentpod.dev","access_token":"SECRET"}`), 0600); err != nil {
		t.Fatalf("write auth.json: %v", err)
	}
	got := MatrixIDFromProfile(dir, "id.agentpod.dev")
	if got == nil || *got != "@analyst-echo:id.agentpod.dev" {
		t.Fatalf("want mxid, got %v", got)
	}
	// a profile with no matrix config → nil
	if MatrixIDFromProfile(t.TempDir(), "id.agentpod.dev") != nil {
		t.Fatal("want nil for no-matrix profile")
	}
}

func TestMatrixIDNeverReturnsToken(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "auth.json"), []byte(`{"user_id":"@x:id.agentpod.dev","access_token":"SECRET-TOKEN"}`), 0600); err != nil {
		t.Fatalf("write auth.json: %v", err)
	}
	got := MatrixIDFromProfile(dir, "id.agentpod.dev")
	if got == nil || strings.Contains(*got, "SECRET") {
		t.Fatalf("token leaked: %v", got)
	}
}

func TestMatrixIDInvalidShape(t *testing.T) {
	dir := t.TempDir()
	// user_id that is NOT mxid-shaped → nil
	if err := os.WriteFile(filepath.Join(dir, "auth.json"), []byte(`{"user_id":"foo","access_token":"SECRET"}`), 0600); err != nil {
		t.Fatalf("write auth.json: %v", err)
	}
	got := MatrixIDFromProfile(dir, "id.agentpod.dev")
	if got != nil {
		t.Fatalf("want nil for invalid mxid shape, got %v", got)
	}
}

func TestMatrixIDFromConfigYAML(t *testing.T) {
	dir := t.TempDir()
	// No auth.json, but config.yaml has a user_id field.
	if err := os.WriteFile(filepath.Join(dir, "config.yaml"), []byte("user_id: \"@bot:id.agentpod.dev\"\nsome_other: value\n"), 0600); err != nil {
		t.Fatalf("write config.yaml: %v", err)
	}
	got := MatrixIDFromProfile(dir, "id.agentpod.dev")
	if got == nil || *got != "@bot:id.agentpod.dev" {
		t.Fatalf("want mxid from config.yaml, got %v", got)
	}
}
