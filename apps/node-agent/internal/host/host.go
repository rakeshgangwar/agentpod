package host

import ("os"; "runtime")

type HostInfo struct {
  Hostname string `json:"hostname"`
  OS       string `json:"os"`
  Arch     string `json:"arch"`
  CPUCount int    `json:"cpuCount"`
}

func Info() HostInfo {
  h, _ := os.Hostname()
  return HostInfo{Hostname: h, OS: runtime.GOOS, Arch: runtime.GOARCH, CPUCount: runtime.NumCPU()}
}
