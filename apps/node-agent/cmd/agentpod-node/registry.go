package main

import "github.com/rakeshgangwar/agentpod/node-agent/internal/descriptor"

// buildRegistry constructs the descriptor registry.
// hermesStartCmd and openclawStartCmd are optional shell commands used by the
// lifecycle Start action; pass "" if lifecycle start/restart is not needed.
func buildRegistry(hermesStartCmd, openclawStartCmd string) *descriptor.Registry {
	reg := descriptor.NewRegistry()
	reg.Register(descriptor.NewHermes("", hermesStartCmd))
	reg.Register(descriptor.NewOpenClaw("", openclawStartCmd))
	reg.Register(descriptor.NewClaudeCode(""))
	reg.Register(descriptor.NewCodex(""))
	return reg
}
