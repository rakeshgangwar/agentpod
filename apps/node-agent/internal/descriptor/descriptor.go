// Package descriptor defines the Descriptor interface and shared types for
// agent runtime harnesses. Each harness (hermes, opencode, …) implements
// Descriptor and is registered with a Registry at startup.
package descriptor

import "context"

// Station is a discovered agent runtime instance.
// JSON tags MUST match the wire contract exactly.
type Station struct {
	Key           string   `json:"key"`
	Harness       string   `json:"harness"`
	Kind          string   `json:"kind"`
	DisplayName   string   `json:"displayName"`
	ParentKey     *string  `json:"parentKey"`
	WorkspacePath *string  `json:"workspacePath"`
	Capabilities  []string `json:"capabilities"`
}

// Health is a point-in-time resource/liveness snapshot for a station.
type Health struct {
	Running      bool     `json:"running"`
	PID          *int     `json:"pid"`
	CpuPct       *float64 `json:"cpuPct"`
	MemBytes     *int64   `json:"memBytes"`
	DiskBytes    *int64   `json:"diskBytes"`
	UptimeSec    *int64   `json:"uptimeSec"`
	LastActivity *string  `json:"lastActivity"`
	Note         *string  `json:"note"`
}

// FsEntry is a single directory entry returned by ListDir.
type FsEntry struct {
	Name     string  `json:"name"`
	Path     string  `json:"path"`
	Type     string  `json:"type"` // "file" | "dir" | "symlink"
	Size     *int64  `json:"size"`
	Modified *string `json:"modified"`
}

// Descriptor is implemented by each agent harness plugin.
type Descriptor interface {
	// Harness returns the harness identifier (e.g. "hermes", "opencode").
	Harness() string

	// Detect discovers all running stations for this harness.
	Detect() ([]Station, error)

	// Health returns a live health snapshot for the named station.
	Health(key string) (Health, error)

	// ListDir lists the directory at path within the station's workspace.
	ListDir(key, path string) ([]FsEntry, error)

	// ReadFile reads up to maxBytes from path within the station's workspace.
	// It returns the raw content bytes, an encoding hint ("utf8" or "base64"),
	// whether the file was truncated, and any error.
	ReadFile(key, path string, maxBytes int64) (content []byte, encoding string, truncated bool, err error)

	// TailLogs streams log output for the station, calling emit for each chunk.
	// If follow is true the stream continues until ctx is cancelled.
	TailLogs(ctx context.Context, key string, follow bool, emit func([]byte) error) error
}
