package config

import ("encoding/json"; "os"; "path/filepath")

type Config struct {
  Hub        string `json:"hub"`
  NodeID     string `json:"nodeId"`
  NodeSecret string `json:"nodeSecret"`
}

func DefaultPath() string {
  d, _ := os.UserConfigDir()
  return filepath.Join(d, "agentpod-node", "config.json")
}

func Save(path string, c Config) error {
  if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil { return err }
  b, err := json.MarshalIndent(c, "", "  "); if err != nil { return err }
  return os.WriteFile(path, b, 0o600)
}

func Load(path string) (Config, error) {
  var c Config
  b, err := os.ReadFile(path); if err != nil { return c, err }
  return c, json.Unmarshal(b, &c)
}
