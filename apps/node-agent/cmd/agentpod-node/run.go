package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/rakeshgangwar/agentpod/node-agent/internal/config"
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

	// TODO(Task 4): replace with the real descriptor handler.
	stub := gateway.HandlerFunc(func(_ context.Context, verb string, _ json.RawMessage, _ func(int, string, bool) error) (any, bool, error) {
		return nil, false, fmt.Errorf("no handler yet (verb=%s)", verb)
	})

	gateway.Run(ctx, cfg, stub)
}
