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
	"github.com/rakeshgangwar/agentpod/node-agent/internal/terminal"
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

	reg := buildRegistry()
	mgr := terminal.NewManager()
	defer mgr.Shutdown()

	// workspaceResolver finds the workspace path for a station key by calling
	// the harness descriptor's Detect() and scanning for the matching station.
	resolver := gateway.WorkspaceFunc(func(key string) (string, error) {
		d, err := reg.For(key)
		if err != nil {
			return "", err
		}
		stations, err := d.Detect()
		if err != nil {
			return "", fmt.Errorf("workspace resolver: detect: %w", err)
		}
		for _, s := range stations {
			if s.Key == key && s.WorkspacePath != nil {
				return *s.WorkspacePath, nil
			}
		}
		return "", fmt.Errorf("workspace resolver: no workspacePath for key %q", key)
	})

	h := gateway.NewTerminalHandler(descriptor.NewHandler(reg), resolver, mgr)
	gateway.Run(ctx, cfg, h)
}
