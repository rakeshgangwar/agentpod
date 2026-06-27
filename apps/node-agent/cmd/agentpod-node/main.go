package main

import ("flag"; "fmt"; "os"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/config"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/enroll"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/host")

func main() {
  if len(os.Args) < 2 { fmt.Println("usage: agentpod-node <enroll|run>"); os.Exit(2) }
  switch os.Args[1] {
  case "enroll":
    fs := flag.NewFlagSet("enroll", flag.ExitOnError)
    hub := fs.String("hub", "", "hub base URL"); token := fs.String("token", "", "enrollment token")
    fs.Parse(os.Args[2:])
    id, sec, err := enroll.Enroll(*hub, *token, host.Info())
    if err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
    if err := config.Save(config.DefaultPath(), config.Config{Hub: *hub, NodeID: id, NodeSecret: sec}); err != nil {
      fmt.Fprintln(os.Stderr, err); os.Exit(1) }
    fmt.Println("enrolled:", id)
  case "run":
    runCmd() // implemented in Task 9
  default:
    fmt.Println("unknown command:", os.Args[1]); os.Exit(2)
  }
}
