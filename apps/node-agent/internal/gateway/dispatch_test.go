package gateway

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestDispatchUnaryResponse(t *testing.T) {
	got := make(chan string, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, _ := websocket.Accept(w, r, nil)
		defer c.Close(websocket.StatusNormalClosure, "")
		c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"req","id":"1","verb":"ping","params":{}}`))
		_, data, _ := c.Read(context.Background())
		got <- string(data)
	}))
	defer srv.Close()

	c, _, _ := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	go serve(context.Background(), c, HandlerFunc(func(ctx context.Context, verb string, p json.RawMessage, emit func(int, string, bool) error) (any, bool, error) {
		return map[string]bool{"pong": true}, false, nil
	}))

	select {
	case m := <-got:
		if !strings.Contains(m, `"type":"res"`) || !strings.Contains(m, `"pong":true`) {
			t.Fatalf("got %s", m)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no response")
	}
}

func TestDispatchCancelRequest(t *testing.T) {
	cancelSeen := make(chan struct{}, 1)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, _ := websocket.Accept(w, r, nil)
		defer c.Close(websocket.StatusNormalClosure, "")
		// send req then immediately send cancel
		c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"req","id":"42","verb":"slow","params":{}}`))
		c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"cancel","id":"42"}`))
		// wait a bit then close
		time.Sleep(500 * time.Millisecond)
	}))
	defer srv.Close()

	c, _, _ := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	go serve(context.Background(), c, HandlerFunc(func(ctx context.Context, verb string, p json.RawMessage, emit func(int, string, bool) error) (any, bool, error) {
		// block until cancelled
		<-ctx.Done()
		cancelSeen <- struct{}{}
		return nil, false, ctx.Err()
	}))

	select {
	case <-cancelSeen:
		// handler saw cancellation — pass
	case <-time.After(2 * time.Second):
		t.Fatal("handler context never cancelled")
	}
}
