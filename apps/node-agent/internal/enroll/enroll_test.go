package enroll

import ("encoding/json"; "net/http"; "net/http/httptest"; "testing"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/host")

func TestEnrollPostsAndParses(t *testing.T) {
  srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    if r.URL.Path != "/public/nodes/enroll" { t.Fatalf("path %s", r.URL.Path) }
    json.NewEncoder(w).Encode(map[string]string{"nodeId": "node_9", "nodeSecret": "sek"})
  }))
  defer srv.Close()
  id, sec, err := Enroll(srv.URL, "tok", host.Info())
  if err != nil { t.Fatal(err) }
  if id != "node_9" || sec != "sek" { t.Fatalf("got %s/%s", id, sec) }
}
