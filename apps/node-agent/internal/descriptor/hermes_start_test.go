package descriptor

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestHermesStart_NativeFallbackLaunchesGatewayRun verifies that on a
// process-tree (non-systemd) Hermes deployment with no configured startCmd,
// Start falls back to launching the profile the native way —
// `hermes -p <name> gateway run --replace` — instead of erroring.
//
// The `-p <name>` form matters: the launched process must match
// hermesPattern() so Health/Stop (which pgrep on the same pattern) recognise
// it. Before this fix, restart (= Stop then Start) killed the profile on root
// deployments and the failed Start left it down (the 502 + outage seen live).
func TestHermesStart_NativeFallbackLaunchesGatewayRun(t *testing.T) {
	home := testdataHermesHome(t)
	d := NewHermes(home) // no startCmd configured

	// Inject a stub `hermes` on PATH that records its args. On macOS/dev there is
	// no `systemctl`, so hermesUnitKnown() is false and Start reaches the native
	// fallback, which resolves `hermes` via PATH to our stub.
	dir := t.TempDir()
	argsFile := filepath.Join(dir, "args.txt")
	stub := filepath.Join(dir, "hermes")
	script := "#!/bin/sh\nprintf '%s ' \"$@\" > " + argsFile + "\n"
	if err := os.WriteFile(stub, []byte(script), 0o755); err != nil {
		t.Fatalf("write stub: %v", err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))

	lc, ok := d.(Lifecycle)
	if !ok {
		t.Fatal("hermes descriptor must implement Lifecycle")
	}
	if err := lc.Start("hermes:coder-kai"); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// Start launches detached (Setsid) and does not Wait; poll for the stub args.
	var got string
	for i := 0; i < 100; i++ {
		if b, err := os.ReadFile(argsFile); err == nil && len(b) > 0 {
			got = strings.TrimSpace(string(b))
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	want := "-p coder-kai gateway run --replace"
	if got != want {
		t.Errorf("native start args:\n got %q\nwant %q", got, want)
	}
}
