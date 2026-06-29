package main

import "fmt"

// resolveEnrollArgs resolves the hub URL and enroll token from flags, falling
// back to env vars. Flags win over env. Returns an error if either is empty.
func resolveEnrollArgs(flagHub, flagToken string, getenv func(string) string) (hub, token string, err error) {
	hub = flagHub
	if hub == "" {
		hub = getenv("AGENTPOD_HUB_URL")
	}
	token = flagToken
	if token == "" {
		token = getenv("AGENTPOD_ENROLL_TOKEN")
	}
	if hub == "" || token == "" {
		return "", "", fmt.Errorf("enroll requires --hub/--token or AGENTPOD_HUB_URL/AGENTPOD_ENROLL_TOKEN")
	}
	return hub, token, nil
}
