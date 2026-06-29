package main

import (
	"errors"
	"testing"

	"github.com/rakeshgangwar/agentpod/node-agent/internal/config"
)

func TestAlreadyEnrolled(t *testing.T) {
	t.Run("valid config with NodeID and NodeSecret → true", func(t *testing.T) {
		cfg := config.Config{Hub: "http://hub", NodeID: "node_abc", NodeSecret: "secret_xyz"}
		if !alreadyEnrolled(cfg, nil) {
			t.Fatal("expected alreadyEnrolled=true for valid config, got false")
		}
	})

	t.Run("load error (file missing) → false", func(t *testing.T) {
		cfg := config.Config{}
		if alreadyEnrolled(cfg, errors.New("file not found")) {
			t.Fatal("expected alreadyEnrolled=false when loadErr != nil, got true")
		}
	})

	t.Run("empty NodeID → false", func(t *testing.T) {
		cfg := config.Config{Hub: "http://hub", NodeID: "", NodeSecret: "secret_xyz"}
		if alreadyEnrolled(cfg, nil) {
			t.Fatal("expected alreadyEnrolled=false when NodeID is empty, got true")
		}
	})

	t.Run("empty NodeSecret → false", func(t *testing.T) {
		cfg := config.Config{Hub: "http://hub", NodeID: "node_abc", NodeSecret: ""}
		if alreadyEnrolled(cfg, nil) {
			t.Fatal("expected alreadyEnrolled=false when NodeSecret is empty, got true")
		}
	})

	t.Run("both NodeID and NodeSecret empty → false", func(t *testing.T) {
		cfg := config.Config{Hub: "http://hub", NodeID: "", NodeSecret: ""}
		if alreadyEnrolled(cfg, nil) {
			t.Fatal("expected alreadyEnrolled=false when both NodeID and NodeSecret are empty, got true")
		}
	})

	t.Run("load error with non-empty fields still → false", func(t *testing.T) {
		// Even if the struct has values, a load error means we cannot trust it.
		cfg := config.Config{Hub: "http://hub", NodeID: "node_abc", NodeSecret: "secret_xyz"}
		if alreadyEnrolled(cfg, errors.New("partial read")) {
			t.Fatal("expected alreadyEnrolled=false when loadErr != nil even with fields set, got true")
		}
	})
}

// TestAlreadyEnrolledWithRealConfig exercises alreadyEnrolled end-to-end using
// config.Save + config.Load so the guard is verified against the real on-disk
// round-trip.
func TestAlreadyEnrolledWithRealConfig(t *testing.T) {
	path := t.TempDir() + "/config.json"

	// Before save: Load returns an error → not enrolled.
	cfg, err := config.Load(path)
	if alreadyEnrolled(cfg, err) {
		t.Fatal("expected alreadyEnrolled=false before any config is written, got true")
	}

	// Save a valid config.
	want := config.Config{Hub: "http://hub.test", NodeID: "node_restart", NodeSecret: "s3cr3t"}
	if err := config.Save(path, want); err != nil {
		t.Fatalf("config.Save: %v", err)
	}

	// After save: Load succeeds → already enrolled.
	cfg, err = config.Load(path)
	if !alreadyEnrolled(cfg, err) {
		t.Fatalf("expected alreadyEnrolled=true after Save, got false (cfg=%+v err=%v)", cfg, err)
	}
}
