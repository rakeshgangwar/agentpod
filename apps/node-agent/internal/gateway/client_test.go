package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/rakeshgangwar/agentpod/node-agent/internal/config"
)

// stubHandler is a no-op handler used by tests that only care about hello/heartbeat.
var stubHandler Handler = HandlerFunc(func(_ context.Context, _ string, _ json.RawMessage, _ func(int, string, bool, string) error) (any, bool, error) {
	return nil, false, fmt.Errorf("no handler yet")
})

func TestRunSendsHello(t *testing.T) {
	got := make(chan string, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer node_1:") {
			t.Error("missing auth")
		}
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close(websocket.StatusNormalClosure, "")
		_, data, err := c.Read(context.Background())
		if err != nil {
			return
		}
		got <- string(data)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cfg := config.Config{Hub: srv.URL, NodeID: "node_1", NodeSecret: "s"}
	go Run(ctx, cfg, stubHandler)

	select {
	case msg := <-got:
		if !strings.Contains(msg, `"type":"hello"`) {
			t.Fatalf("first msg = %s", msg)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no hello received")
	}
}
