package gateway

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/rakeshgangwar/agentpod/node-agent/internal/config"
	"github.com/rakeshgangwar/agentpod/node-agent/internal/host"
)

func wsURL(hub string) string {
	u := strings.Replace(strings.Replace(hub, "http://", "ws://", 1), "https://", "wss://", 1)
	return u + "/public/nodes/gateway"
}

func Run(ctx context.Context, cfg config.Config) error {
	backoff := time.Second
	for ctx.Err() == nil {
		// onConnected is called by connectOnce after a successful dial+hello,
		// resetting the backoff so a previously-flaky connection doesn't stay
		// penalised once it recovers.
		if err := connectOnce(ctx, cfg, func() { backoff = time.Second }); err != nil {
			t := time.NewTimer(backoff)
			select {
			case <-ctx.Done():
				t.Stop()
				return ctx.Err()
			case <-t.C:
			}
			if backoff < 30*time.Second {
				backoff *= 2
			}
		}
	}
	return ctx.Err()
}

func connectOnce(ctx context.Context, cfg config.Config, onConnected func()) error {
	c, _, err := websocket.Dial(ctx, wsURL(cfg.Hub), &websocket.DialOptions{
		HTTPHeader: map[string][]string{"Authorization": {"Bearer " + cfg.NodeID + ":" + cfg.NodeSecret}},
	})
	if err != nil {
		return err
	}
	defer c.Close(websocket.StatusNormalClosure, "")

	hello, _ := json.Marshal(map[string]any{"type": "hello", "hostInfo": host.Info()})
	if err := c.Write(ctx, websocket.MessageText, hello); err != nil {
		return err
	}

	// Connection is fully established — reset the reconnect backoff.
	onConnected()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			hb, _ := json.Marshal(map[string]any{"type": "heartbeat", "ts": time.Now().UnixMilli()})
			if err := c.Write(ctx, websocket.MessageText, hb); err != nil {
				return err
			}
		}
	}
}
