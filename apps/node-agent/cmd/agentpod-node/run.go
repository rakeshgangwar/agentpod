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

	reg := buildRegistry(cfg.HermesStartCmd, cfg.OpenClawStartCmd)
	mgr := terminal.NewManager()
	defer mgr.Shutdown()

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

	// lifecycleFn resolves the descriptor for key, checks it implements Lifecycle,
	// then performs stop/start/restart as requested.
	lifecycleFn := gateway.LifecycleFunc(func(key, action string) error {
		d, err := reg.For(key)
		if err != nil {
			return err
		}
		lc, ok := d.(descriptor.Lifecycle)
		if !ok {
			return fmt.Errorf("lifecycle: descriptor for %q does not support lifecycle", key)
		}
		switch action {
		case "stop":
			return lc.Stop(key)
		case "start":
			return lc.Start(key)
		case "restart":
			if err := lc.Stop(key); err != nil {
				return err
			}
			return lc.Start(key)
		default:
			return fmt.Errorf("lifecycle: unknown action %q", action)
		}
	})

	h := gateway.NewTerminalHandler(descriptor.NewHandler(reg), resolver, mgr, lifecycleFn)
	gateway.Run(ctx, cfg, h)
}
