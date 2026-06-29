package gateway

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/rakeshgangwar/agentpod/node-agent/internal/terminal"
)

// TestTerminalVerbs drives the gateway dispatch layer end-to-end for the
// terminal verb family:
//
//  1. term.open   → returns {sessionId}
//  2. term.attach → starts streaming base64 PTY output
//  3. input frame → keystroke reaches the PTY (cat echoes it back)
//  4. cancel      → detaches WITHOUT closing the session
//
// /bin/cat is used as the shell: it echoes stdin back to stdout, making it
// trivial to verify that input → stream output round-trips correctly.
func TestTerminalVerbs(t *testing.T) {
	t.Setenv("SHELL", "/bin/cat")

	workspace := t.TempDir()
	mgr := terminal.NewManager()
	t.Cleanup(mgr.Shutdown)

	resolver := WorkspaceFunc(func(_ string) (string, error) { return workspace, nil })

	// inner handler: should never be reached for term.* verbs.
	inner := HandlerFunc(func(_ context.Context, v string, _ json.RawMessage, _ func(int, string, bool, string) error) (any, bool, error) {
		return nil, false, fmt.Errorf("unexpected verb forwarded to inner: %s", v)
	})
	h := NewTerminalHandler(inner, resolver, mgr)

	// frames receives every JSON frame the node sends to the hub.
	frames := make(chan []byte, 64)
	// hubConnCh delivers the hub-side WS connection to the test goroutine.
	hubConnCh := make(chan *websocket.Conn, 1)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			t.Errorf("accept: %v", err)
			return
		}
		defer c.Close(websocket.StatusNormalClosure, "")
		hubConnCh <- c

		// Reader goroutine: drain all node→hub frames into the channel.
		ctx := r.Context()
		for {
			_, data, err := c.Read(ctx)
			if err != nil {
				return
			}
			cp := make([]byte, len(data))
			copy(cp, data)
			select {
			case frames <- cp:
			default: // drop if test is slow (channel is large enough)
			}
		}
	}))
	defer srv.Close()

	// Connect the node side and start the dispatch loop.
	nodeConn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	go serve(context.Background(), nodeConn, h)

	// Obtain the hub-side connection.
	var hubConn *websocket.Conn
	select {
	case hubConn = <-hubConnCh:
	case <-time.After(2 * time.Second):
		t.Fatal("hub connection timeout")
	}

	ctx := context.Background()

	// writeHub sends a raw JSON string to the node.
	writeHub := func(msg string) {
		t.Helper()
		if err := hubConn.Write(ctx, websocket.MessageText, []byte(msg)); err != nil {
			t.Errorf("hub write: %v", err)
		}
	}

	// readFrame waits for the next frame from the node with a 3-second timeout.
	readFrame := func() map[string]any {
		t.Helper()
		select {
		case data := <-frames:
			var m map[string]any
			if err := json.Unmarshal(data, &m); err != nil {
				t.Fatalf("bad JSON frame: %v – raw: %s", err, data)
			}
			return m
		case <-time.After(3 * time.Second):
			t.Fatal("timeout waiting for frame from node")
			return nil
		}
	}

	// ── Step 1: term.open ────────────────────────────────────────────────────
	writeHub(`{"type":"req","id":"open-1","verb":"term.open","params":{"key":"test:s","cols":80,"rows":24}}`)

	msg := readFrame()
	if msg["type"] != "res" {
		t.Fatalf("term.open: expected res frame, got type=%v", msg["type"])
	}
	if ok, _ := msg["ok"].(bool); !ok {
		t.Fatalf("term.open failed: %v", msg["error"])
	}
	dataMap, ok := msg["data"].(map[string]any)
	if !ok {
		t.Fatalf("term.open: data is %T, want map", msg["data"])
	}
	sessionID, _ := dataMap["sessionId"].(string)
	if sessionID == "" {
		t.Fatal("term.open: empty sessionId")
	}
	t.Logf("sessionId = %s", sessionID)

	// ── Step 2: term.attach ──────────────────────────────────────────────────
	writeHub(fmt.Sprintf(
		`{"type":"req","id":"attach-1","verb":"term.attach","params":{"sessionId":"%s"}}`,
		sessionID,
	))

	// Give the attach goroutine time to subscribe before we send input.
	time.Sleep(50 * time.Millisecond)

	// ── Step 3: input frame — base64("hi\n") ─────────────────────────────────
	inputB64 := base64.StdEncoding.EncodeToString([]byte("hi\n"))
	writeHub(fmt.Sprintf(`{"type":"input","id":"attach-1","data":"%s"}`, inputB64))

	// ── Step 4: wait for a base64 stream frame whose chunk contains "hi" ─────
	deadline := time.Now().Add(5 * time.Second)
	var gotStream bool
	for !gotStream && time.Now().Before(deadline) {
		select {
		case data := <-frames:
			var m map[string]any
			json.Unmarshal(data, &m)
			if m["type"] == "stream" && m["enc"] == "base64" {
				eof, _ := m["eof"].(bool)
				if eof {
					continue
				}
				chunk, _ := m["chunk"].(string)
				decoded, err := base64.StdEncoding.DecodeString(chunk)
				if err == nil && strings.Contains(string(decoded), "hi") {
					gotStream = true
				}
			}
		case <-time.After(200 * time.Millisecond):
			// keep polling
		}
	}
	if !gotStream {
		t.Fatal("no base64 stream frame containing 'hi' received after input")
	}

	// ── Step 5: cancel → detach (session must survive) ───────────────────────
	writeHub(`{"type":"cancel","id":"attach-1"}`)

	// Allow the cancel to propagate through the dispatch loop.
	time.Sleep(200 * time.Millisecond)

	if _, ok := mgr.Get(sessionID); !ok {
		t.Fatal("cancel should detach the subscriber but NOT close the session")
	}
	t.Log("session survived cancel (detach semantics confirmed)")
}
