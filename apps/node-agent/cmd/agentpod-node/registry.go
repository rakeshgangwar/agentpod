package main

import "github.com/rakeshgangwar/agentpod/node-agent/internal/descriptor"

// buildRegistry constructs the descriptor registry shared by `run` and `detect`.
// Concrete harness descriptors are registered here; home defaults are resolved
// inside each constructor.
func buildRegistry() *descriptor.Registry {
	reg := descriptor.NewRegistry()
	reg.Register(descriptor.NewHermes(""))     // Task 5
	reg.Register(descriptor.NewOpenClaw(""))   // Task 6
	reg.Register(descriptor.NewClaudeCode("")) // Task 7
	reg.Register(descriptor.NewCodex(""))      // Task 7
	return reg
}
