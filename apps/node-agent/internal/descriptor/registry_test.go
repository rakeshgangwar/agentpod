package descriptor

import (
	"context"
	"testing"
)

// fakeDescriptor is a minimal test-only Descriptor.
type fakeDescriptor struct {
	harness  string
	stations []Station
}

func (f *fakeDescriptor) Harness() string { return f.harness }

func (f *fakeDescriptor) Detect() ([]Station, error) { return f.stations, nil }

func (f *fakeDescriptor) Health(key string) (Health, error) {
	return Health{Running: true}, nil
}

func (f *fakeDescriptor) ListDir(key, path string) ([]FsEntry, error) {
	return []FsEntry{{Name: "file.txt", Path: path + "/file.txt", Type: "file"}}, nil
}

func (f *fakeDescriptor) ReadFile(key, path string, maxBytes int64) ([]byte, string, bool, error) {
	return []byte("hello"), "utf8", false, nil
}

func (f *fakeDescriptor) TailLogs(ctx context.Context, key string, follow bool, emit func([]byte) error) error {
	return emit([]byte("log line\n"))
}

// --- Registry tests ---

func TestRegistryDetectAll(t *testing.T) {
	reg := NewRegistry()
	fake := &fakeDescriptor{
		harness: "fake",
		stations: []Station{
			{Key: "fake:s1", Harness: "fake", Kind: "agent", DisplayName: "S1", Capabilities: []string{}},
		},
	}
	reg.Register(fake)

	stations := reg.DetectAll()
	if len(stations) != 1 {
		t.Fatalf("expected 1 station, got %d", len(stations))
	}
	if stations[0].Key != "fake:s1" {
		t.Fatalf("expected key fake:s1, got %s", stations[0].Key)
	}
}

func TestRegistryFor_FullKey(t *testing.T) {
	reg := NewRegistry()
	reg.Register(&fakeDescriptor{harness: "fake"})

	d, err := reg.For("fake:s1")
	if err != nil {
		t.Fatalf("For(fake:s1): %v", err)
	}
	if d.Harness() != "fake" {
		t.Fatalf("expected harness fake, got %s", d.Harness())
	}
}

func TestRegistryFor_BareHarness(t *testing.T) {
	reg := NewRegistry()
	reg.Register(&fakeDescriptor{harness: "fake"})

	d, err := reg.For("fake")
	if err != nil {
		t.Fatalf("For(fake): %v", err)
	}
	if d.Harness() != "fake" {
		t.Fatalf("expected harness fake, got %s", d.Harness())
	}
}

func TestRegistryFor_Unknown(t *testing.T) {
	reg := NewRegistry()
	_, err := reg.For("unknown:key")
	if err == nil {
		t.Fatal("expected error for unknown harness")
	}
}

// --- safeJoin tests ---

func TestSafeJoin_Normal(t *testing.T) {
	got, err := safeJoin("/workspace", "subdir/file.txt")
	if err != nil {
		t.Fatalf("safeJoin normal: %v", err)
	}
	if got != "/workspace/subdir/file.txt" {
		t.Fatalf("safeJoin: got %s", got)
	}
}

func TestSafeJoin_DotDotEscape(t *testing.T) {
	_, err := safeJoin("/workspace", "../etc/passwd")
	if err == nil {
		t.Fatal("expected error for .. escape")
	}
}

func TestSafeJoin_AbsolutePath(t *testing.T) {
	_, err := safeJoin("/workspace", "/etc/passwd")
	if err == nil {
		t.Fatal("expected error for absolute path")
	}
}

func TestSafeJoin_RootItself(t *testing.T) {
	got, err := safeJoin("/workspace", ".")
	if err != nil {
		t.Fatalf("safeJoin root dot: %v", err)
	}
	if got != "/workspace" {
		t.Fatalf("safeJoin root dot: got %s", got)
	}
}
