package descriptor

import (
	"context"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// hermesDescriptor implements Descriptor for the Hermes agent harness.
// The Hermes home directory layout is:
//
//	~/.hermes/
//	  config.yaml
//	  auth.json
//	  sessions/
//	  kanban.db
//	  logs/          ← global log files
//	  profiles/
//	    <name>/      ← one workspace per profile
type hermesDescriptor struct {
	home     string // absolute path to the .hermes home directory
	startCmd string // optional; set by NewHermes; used by Start
}

// NewHermes returns a Descriptor for the Hermes harness.
// home is the path to the Hermes home directory (e.g. "~/.hermes").
// If home is empty it defaults to $HOME/.hermes.
// startCmd (optional) is the shell command used by Start to launch Hermes.
// Hermes always advertises the "lifecycle" capability; if startCmd is empty,
// Start returns a descriptive error.
func NewHermes(home string, startCmd ...string) Descriptor {
	if home == "" {
		userHome, err := os.UserHomeDir()
		if err != nil {
			userHome = "."
		}
		home = filepath.Join(userHome, ".hermes")
	}
	var cmd string
	if len(startCmd) > 0 {
		cmd = startCmd[0]
	}
	return &hermesDescriptor{home: home, startCmd: cmd}
}

// Harness returns the harness identifier.
func (h *hermesDescriptor) Harness() string { return "hermes" }

// Detect discovers all Hermes stations. It returns empty (nil-safe) if the
// home directory does not exist.
func (h *hermesDescriptor) Detect() ([]Station, error) {
	if _, err := os.Stat(h.home); os.IsNotExist(err) {
		return []Station{}, nil
	}

	caps := []string{"health", "logs", "fs.read", "lifecycle"}
	homeCopy := h.home

	stations := []Station{
		{
			Key:           "hermes",
			Harness:       "hermes",
			Kind:          "composite",
			DisplayName:   "Hermes",
			ParentKey:     nil,
			WorkspacePath: &homeCopy,
			Capabilities:  caps,
		},
	}

	profilesDir := filepath.Join(h.home, "profiles")
	entries, err := os.ReadDir(profilesDir)
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("hermes: reading profiles dir: %w", err)
	}

	parentKey := "hermes"
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		key := "hermes:" + name
		wsPath := filepath.Join(profilesDir, name)
		wsCopy := wsPath
		stations = append(stations, Station{
			Key:           key,
			Harness:       "hermes",
			Kind:          "composite",
			DisplayName:   name,
			ParentKey:     &parentKey,
			WorkspacePath: &wsCopy,
			Capabilities:  caps,
		})
	}

	return stations, nil
}

// workspaceFor maps a station key to its workspace root path.
func (h *hermesDescriptor) workspaceFor(key string) (string, error) {
	if key == "hermes" {
		return h.home, nil
	}
	if strings.HasPrefix(key, "hermes:") {
		name := strings.TrimPrefix(key, "hermes:")
		if name == "" {
			return "", fmt.Errorf("hermes: empty profile name in key %q", key)
		}
		return filepath.Join(h.home, "profiles", name), nil
	}
	return "", fmt.Errorf("hermes: unrecognized key %q", key)
}

// Health returns a best-effort liveness/resource snapshot for a station.
func (h *hermesDescriptor) Health(key string) (Health, error) {
	workspace, err := h.workspaceFor(key)
	if err != nil {
		return Health{}, err
	}

	health := Health{}

	// Compute disk usage by walking the workspace.
	var diskBytes int64
	_ = filepath.WalkDir(workspace, func(_ string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries
		}
		if !d.IsDir() {
			info, err := d.Info()
			if err == nil {
				diskBytes += info.Size()
			}
		}
		return nil
	})
	health.DiskBytes = &diskBytes

	// Best-effort process check via pgrep.
	health.Running, _ = hermesProcessRunning(key)

	return health, nil
}

// hermesPattern returns the pgrep pattern for a Hermes station key.
func hermesPattern(key string) string {
	if key == "hermes" {
		return "hermes"
	}
	name := strings.TrimPrefix(key, "hermes:")
	return fmt.Sprintf("hermes -p %s gateway", name)
}

// hermesPID returns the PID of the running Hermes process for key,
// or an error if no matching process is found.
func hermesPID(key string) (int, error) {
	out, err := exec.Command("pgrep", "-f", hermesPattern(key)).Output()
	if err != nil {
		return 0, fmt.Errorf("no hermes process for key %q", key)
	}
	lines := strings.Fields(strings.TrimSpace(string(out)))
	if len(lines) == 0 {
		return 0, fmt.Errorf("no hermes process for key %q", key)
	}
	return strconv.Atoi(lines[0])
}

// hermesProcessRunning checks the process table for a running Hermes process.
// For a profile key "hermes:<name>" it looks for "hermes -p <name> gateway".
// For the root key it looks for any "hermes" process.
// Returns false (not an error) when the check cannot be performed.
func hermesProcessRunning(key string) (bool, error) {
	cmd := exec.Command("pgrep", "-f", hermesPattern(key))
	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if exitErr.ExitCode() == 1 {
				return false, nil
			}
		}
		return false, nil
	}
	return true, nil
}

// Stop implements Lifecycle. It finds the running Hermes process and sends
// SIGTERM, escalating to SIGKILL after LifecycleGracePeriod.
func (h *hermesDescriptor) Stop(key string) error {
	pid, err := hermesPID(key)
	if err != nil {
		return fmt.Errorf("hermes: stop %q: %w", key, err)
	}
	return stopProcess(pid, LifecycleGracePeriod)
}

// Start implements Lifecycle. It runs the configured start command in a new
// session (detached). If no start command is set it returns a descriptive error.
//
// Configure the start command by passing it to NewHermes or by setting
// hermesStartCmd in the node config file.
func (h *hermesDescriptor) Start(key string) error {
	if h.startCmd == "" {
		return fmt.Errorf("no start command configured for hermes (set hermesStartCmd in node config)")
	}
	cmd := exec.Command("sh", "-c", h.startCmd)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}

// ListDir lists the directory at rel (relative to the station's workspace).
func (h *hermesDescriptor) ListDir(key, rel string) ([]FsEntry, error) {
	workspace, err := h.workspaceFor(key)
	if err != nil {
		return nil, err
	}

	target, err := safeJoin(workspace, rel)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(target)
	if err != nil {
		return nil, fmt.Errorf("hermes: ListDir %q: %w", target, err)
	}

	result := make([]FsEntry, 0, len(entries))
	for _, entry := range entries {
		fsEntry := FsEntry{
			Name: entry.Name(),
			Path: filepath.Join(rel, entry.Name()),
		}
		switch {
		case entry.Type()&fs.ModeSymlink != 0:
			fsEntry.Type = "symlink"
		case entry.IsDir():
			fsEntry.Type = "dir"
		default:
			fsEntry.Type = "file"
			info, err := entry.Info()
			if err == nil {
				sz := info.Size()
				fsEntry.Size = &sz
				mod := info.ModTime().UTC().Format(time.RFC3339)
				fsEntry.Modified = &mod
			}
		}
		result = append(result, fsEntry)
	}
	return result, nil
}

// defaultMaxBytes is the fallback cap when ReadFile is called with maxBytes == 0.
const defaultMaxBytes = 1 << 20 // 1 MiB

// ReadFile reads up to maxBytes from path within the station's workspace.
// It returns the raw bytes, encoding hint ("" means auto-detect in handler),
// whether the file was truncated, and any error.
func (h *hermesDescriptor) ReadFile(key, rel string, maxBytes int64) ([]byte, string, bool, error) {
	workspace, err := h.workspaceFor(key)
	if err != nil {
		return nil, "", false, err
	}

	target, err := safeJoin(workspace, rel)
	if err != nil {
		return nil, "", false, err
	}

	if maxBytes <= 0 {
		maxBytes = defaultMaxBytes
	}

	f, err := os.Open(target)
	if err != nil {
		return nil, "", false, fmt.Errorf("hermes: ReadFile %q: %w", target, err)
	}
	defer f.Close()

	// Read up to maxBytes+1 so we can detect truncation.
	buf := make([]byte, maxBytes+1)
	n, err := io.ReadFull(f, buf)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, "", false, fmt.Errorf("hermes: ReadFile read %q: %w", target, err)
	}

	truncated := int64(n) > maxBytes
	if truncated {
		n = int(maxBytes)
	}

	return buf[:n], "", truncated, nil
}

// TailLogs emits existing log content and, if follow is true, polls for
// appends until ctx is cancelled.
//
// Log search order:
//  1. <home>/logs/ — always searched for any key.
//  2. <home>/profiles/<name>/ — searched for profile keys (profile may contain
//     its own log files).
//
// The Hermes CLI is preferred when on PATH, but the implementation falls back
// to direct file reads so fixture tests pass without the CLI installed.
func (h *hermesDescriptor) TailLogs(ctx context.Context, key string, follow bool, emit func([]byte) error) error {
	// Determine which directories to search for log files.
	logDirs := []string{filepath.Join(h.home, "logs")}

	if strings.HasPrefix(key, "hermes:") {
		name := strings.TrimPrefix(key, "hermes:")
		profileDir := filepath.Join(h.home, "profiles", name)
		logDirs = append(logDirs, profileDir)
	}

	// Collect all log file paths from the log directories.
	logFiles := collectLogFiles(logDirs)

	if !follow {
		// One-shot: emit all existing content.
		return emitLogFiles(logFiles, emit)
	}

	// Follow mode: emit existing content, then poll for appends.
	if err := emitLogFiles(logFiles, emit); err != nil {
		return err
	}

	// Track offsets per file for incremental reads.
	offsets := make(map[string]int64, len(logFiles))
	for _, f := range logFiles {
		info, err := os.Stat(f)
		if err == nil {
			offsets[f] = info.Size()
		}
	}

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			// Re-discover log files (new files may have appeared).
			logFiles = collectLogFiles(logDirs)
			for _, path := range logFiles {
				off := offsets[path]
				n, err := emitLogFileFrom(path, off, emit)
				if err != nil {
					// Best effort — skip unreadable files.
					continue
				}
				offsets[path] = off + n
			}
		}
	}
}

// collectLogFiles walks dirs and returns paths of all regular files found.
// Missing directories are silently skipped.
func collectLogFiles(dirs []string) []string {
	var files []string
	for _, dir := range dirs {
		_ = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if !d.IsDir() {
				files = append(files, path)
			}
			return nil
		})
	}
	return files
}

// emitLogFiles reads and emits each file's full content.
func emitLogFiles(paths []string, emit func([]byte) error) error {
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue // best effort
		}
		if len(data) == 0 {
			continue
		}
		if err := emit(data); err != nil {
			return err
		}
	}
	return nil
}

// emitLogFileFrom reads from offset and emits new bytes. Returns bytes read.
func emitLogFileFrom(path string, offset int64, emit func([]byte) error) (int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		return 0, err
	}

	data, err := io.ReadAll(f)
	if err != nil {
		return 0, err
	}
	if len(data) == 0 {
		return 0, nil
	}
	if err := emit(data); err != nil {
		return 0, err
	}
	return int64(len(data)), nil
}
