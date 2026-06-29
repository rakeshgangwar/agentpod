package main

import ("flag"; "fmt"; "os"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/config"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/enroll"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/host")

// alreadyEnrolled returns true when a previously saved config exists and
// contains both NodeID and NodeSecret, meaning the node has already been
// enrolled. This is used to make the enroll subcommand idempotent so that
// container restarts (which re-run the entrypoint) do not attempt to consume
// an already-spent one-time enrollment token.
func alreadyEnrolled(cfg config.Config, loadErr error) bool {
  return loadErr == nil && cfg.NodeID != "" && cfg.NodeSecret != ""
}

func main() {
  if len(os.Args) < 2 { fmt.Println("usage: agentpod-node <enroll|run|detect>"); os.Exit(2) }
  switch os.Args[1] {
  case "enroll":
    // Idempotency guard: if a valid config already exists on disk, skip the
    // network call entirely. This makes "enroll && run" in the entrypoints
    // safe across container restarts — the one-time token is not re-used.
    if existing, err := config.Load(config.DefaultPath()); alreadyEnrolled(existing, err) {
      fmt.Println("already enrolled:", existing.NodeID)
      return
    }
    fs := flag.NewFlagSet("enroll", flag.ExitOnError)
    flagHub := fs.String("hub", "", "hub base URL"); flagToken := fs.String("token", "", "enrollment token")
    fs.Parse(os.Args[2:])
    hub, token, err := resolveEnrollArgs(*flagHub, *flagToken, os.Getenv)
    if err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
    id, sec, err := enroll.Enroll(hub, token, host.Info())
    if err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
    if err := config.Save(config.DefaultPath(), config.Config{Hub: hub, NodeID: id, NodeSecret: sec}); err != nil {
      fmt.Fprintln(os.Stderr, err); os.Exit(1) }
    fmt.Println("enrolled:", id)
  case "run":
    runCmd() // implemented in Task 9
  case "detect":
    detectCmd() // debug/ops: print detected stations as JSON
  default:
    fmt.Println("unknown command:", os.Args[1]); os.Exit(2)
  }
}
