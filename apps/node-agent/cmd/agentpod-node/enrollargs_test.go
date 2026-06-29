package main

import "testing"

func TestResolveEnrollArgs(t *testing.T) {
	t.Run("flags set → returned verbatim (env ignored)", func(t *testing.T) {
		fakeEnv := func(key string) string {
			m := map[string]string{
				"AGENTPOD_HUB_URL":      "http://env-hub.example.com",
				"AGENTPOD_ENROLL_TOKEN": "env-token",
			}
			return m[key]
		}
		hub, token, err := resolveEnrollArgs("http://flag-hub.example.com", "flag-token", fakeEnv)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if hub != "http://flag-hub.example.com" {
			t.Errorf("hub = %q, want flag value", hub)
		}
		if token != "flag-token" {
			t.Errorf("token = %q, want flag value", token)
		}
	})

	t.Run("flags empty + env set → env values returned", func(t *testing.T) {
		fakeEnv := func(key string) string {
			m := map[string]string{
				"AGENTPOD_HUB_URL":      "http://env-hub.example.com",
				"AGENTPOD_ENROLL_TOKEN": "env-token",
			}
			return m[key]
		}
		hub, token, err := resolveEnrollArgs("", "", fakeEnv)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if hub != "http://env-hub.example.com" {
			t.Errorf("hub = %q, want env value", hub)
		}
		if token != "env-token" {
			t.Errorf("token = %q, want env value", token)
		}
	})

	t.Run("flag set + env set → flag wins", func(t *testing.T) {
		fakeEnv := func(key string) string {
			m := map[string]string{
				"AGENTPOD_HUB_URL":      "http://env-hub.example.com",
				"AGENTPOD_ENROLL_TOKEN": "env-token",
			}
			return m[key]
		}
		hub, token, err := resolveEnrollArgs("http://flag-hub.example.com", "", fakeEnv)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if hub != "http://flag-hub.example.com" {
			t.Errorf("hub = %q, want flag value", hub)
		}
		if token != "env-token" {
			t.Errorf("token = %q, want env value", token)
		}
	})

	t.Run("both empty → error", func(t *testing.T) {
		fakeEnv := func(key string) string { return "" }
		_, _, err := resolveEnrollArgs("", "", fakeEnv)
		if err == nil {
			t.Fatal("expected error when both hub and token are empty, got nil")
		}
	})
}
