package config

import ("path/filepath"; "testing")

func TestSaveLoadRoundTrip(t *testing.T) {
  p := filepath.Join(t.TempDir(), "config.json")
  want := Config{Hub: "http://h", NodeID: "node_1", NodeSecret: "s"}
  if err := Save(p, want); err != nil { t.Fatal(err) }
  got, err := Load(p)
  if err != nil { t.Fatal(err) }
  if got != want { t.Fatalf("got %+v want %+v", got, want) }
}
