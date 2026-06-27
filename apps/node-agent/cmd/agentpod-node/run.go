package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/rakeshgangwar/agentpod/node-agent/internal/config"
	"github.com/rakeshgangwar/agentpod/node-agent/internal/descriptor"
	"github.com/rakeshgangwar/agentpod/node-agent/internal/gateway"
)

func runCmd() {
	cfg, err := config.Load(config.DefaultPath())
	if err != nil {
		fmt.Fprintln(os.Stderr, "not enrolled; run `agentpod-node enroll` first:", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	fmt.Println("connecting to", cfg.Hub, "as", cfg.NodeID)

	// Build the descriptor registry. Concrete harness descriptors are registered
	// here. Hermes (Task 5) and OpenClaw (Task 6) are active; home defaults are
	// resolved inside each constructor.
	reg := descriptor.NewRegistry()
	reg.Register(descriptor.NewHermes(""))   // Task 5
	reg.Register(descriptor.NewOpenClaw("")) // Task 6

	gateway.Run(ctx, cfg, descriptor.NewHandler(reg))
}
