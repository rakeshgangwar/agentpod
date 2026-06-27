package enroll

import ("bytes"; "encoding/json"; "fmt"; "net/http"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/host")

type req struct { Token string `json:"token"`; HostInfo host.HostInfo `json:"hostInfo"` }
type resp struct { NodeID string `json:"nodeId"`; NodeSecret string `json:"nodeSecret"`; Error string `json:"error"` }

func Enroll(hubURL, token string, hi host.HostInfo) (string, string, error) {
  body, _ := json.Marshal(req{Token: token, HostInfo: hi})
  r, err := http.Post(hubURL+"/public/nodes/enroll", "application/json", bytes.NewReader(body))
  if err != nil { return "", "", err }
  defer r.Body.Close()
  var out resp
  if err := json.NewDecoder(r.Body).Decode(&out); err != nil { return "", "", err }
  if r.StatusCode != 200 { return "", "", fmt.Errorf("enroll failed: %s", out.Error) }
  return out.NodeID, out.NodeSecret, nil
}
