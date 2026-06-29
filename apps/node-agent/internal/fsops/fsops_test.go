package fsops_test

import (
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rakeshgangwar/agentpod/node-agent/internal/fsops"
)

// ── Jail tests ──────────────────────────────────────────────────────────────

func TestJail_AllowsLegitNestedPath(t *testing.T) {
	root := t.TempDir()
	got, err := fsops.Jail(root, "a/b/c.txt")
	if err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	want := filepath.Join(root, "a/b/c.txt")
	// On macOS t.TempDir() may return /var/folders/... which EvalSymlinks resolves
	// to /private/var/folders/...; compare the Clean of both.
	if filepath.Clean(got) != filepath.Clean(want) {
		// Accept if resolved versions match.
		rGot, _ := filepath.EvalSymlinks(filepath.Dir(got))
		rWant, _ := filepath.EvalSymlinks(filepath.Dir(want))
		if rGot != rWant {
			t.Fatalf("want %s, got %s", want, got)
		}
	}
}

func TestJail_AllowsRoot(t *testing.T) {
	root := t.TempDir()
	_, err := fsops.Jail(root, ".")
	if err != nil {
		t.Fatalf("Jail(root, '.') should be ok: %v", err)
	}
}

func TestJail_RejectsDotDotEscape(t *testing.T) {
	root := t.TempDir()
	_, err := fsops.Jail(root, "../escape")
	if !errors.Is(err, fsops.ErrEscape) {
		t.Fatalf("expected ErrEscape for '../escape', got %v", err)
	}
}

func TestJail_RejectsAbsolutePathOutsideRoot(t *testing.T) {
	root := t.TempDir()
	_, err := fsops.Jail(root, "/etc/passwd")
	if !errors.Is(err, fsops.ErrEscape) {
		t.Fatalf("expected ErrEscape for '/etc/passwd', got %v", err)
	}
}

func TestJail_RejectsEmbeddedDotDotEscape(t *testing.T) {
	root := t.TempDir()
	_, err := fsops.Jail(root, "a/../../b")
	if !errors.Is(err, fsops.ErrEscape) {
		t.Fatalf("expected ErrEscape for 'a/../../b', got %v", err)
	}
}

func TestJail_RejectsSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	// Create root/link -> /tmp (outside root)
	linkPath := filepath.Join(root, "link")
	if err := os.Symlink("/tmp", linkPath); err != nil {
		t.Fatalf("symlink: %v", err)
	}
	_, err := fsops.Jail(root, "link/x")
	if !errors.Is(err, fsops.ErrEscape) {
		t.Fatalf("expected ErrEscape for symlink-escape, got %v", err)
	}
}

func TestJail_RejectsSymlinkFinalComponent(t *testing.T) {
	root := t.TempDir()
	linkPath := filepath.Join(root, "link")
	if err := os.Symlink("/etc", linkPath); err != nil {
		t.Fatalf("symlink: %v", err)
	}
	if _, err := fsops.Jail(root, "link"); !errors.Is(err, fsops.ErrEscape) {
		t.Fatalf("expected ErrEscape for symlink final component, got %v", err)
	}
}

// ── Write tests ──────────────────────────────────────────────────────────────

func TestWrite_RoundTripUtf8(t *testing.T) {
	root := t.TempDir()
	content := "hello, world\n"
	n, bp, err := fsops.Write(root, "hello.txt", content, "utf8", false)
	if err != nil {
		t.Fatalf("Write: %v", err)
	}
	if n != len(content) {
		t.Fatalf("want bytesWritten=%d, got %d", len(content), n)
	}
	if bp != "" {
		t.Fatalf("expected no backupPath, got %q", bp)
	}
	// Read back and verify.
	got, err := os.ReadFile(filepath.Join(root, "hello.txt"))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(got) != content {
		t.Fatalf("content mismatch: want %q got %q", content, string(got))
	}
}

func TestWrite_RoundTripBase64(t *testing.T) {
	root := t.TempDir()
	raw := []byte("binary\x00data")
	encoded := base64.StdEncoding.EncodeToString(raw)
	n, _, err := fsops.Write(root, "bin.bin", encoded, "base64", false)
	if err != nil {
		t.Fatalf("Write base64: %v", err)
	}
	if n != len(raw) {
		t.Fatalf("want bytesWritten=%d, got %d", len(raw), n)
	}
	got, err := os.ReadFile(filepath.Join(root, "bin.bin"))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(got) != string(raw) {
		t.Fatalf("binary content mismatch")
	}
}

func TestWrite_BackupCreatesOldContent(t *testing.T) {
	root := t.TempDir()
	original := "original content"
	// Write original file.
	if err := os.WriteFile(filepath.Join(root, "cfg.txt"), []byte(original), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}
	// Overwrite with backup.
	newContent := "new content"
	_, bp, err := fsops.Write(root, "cfg.txt", newContent, "utf8", true)
	if err != nil {
		t.Fatalf("Write with backup: %v", err)
	}
	if bp == "" {
		t.Fatal("expected backupPath to be set")
	}
	if !strings.HasSuffix(bp, ".bak") {
		t.Fatalf("backupPath should end with .bak, got %q", bp)
	}
	// Backup should contain OLD content.
	bak, err := os.ReadFile(bp)
	if err != nil {
		t.Fatalf("ReadFile backup: %v", err)
	}
	if string(bak) != original {
		t.Fatalf("backup content: want %q got %q", original, string(bak))
	}
	// Main file should have NEW content.
	main, err := os.ReadFile(filepath.Join(root, "cfg.txt"))
	if err != nil {
		t.Fatalf("ReadFile main: %v", err)
	}
	if string(main) != newContent {
		t.Fatalf("main content: want %q got %q", newContent, string(main))
	}
}

func TestWrite_BackupNoOpWhenFileAbsent(t *testing.T) {
	root := t.TempDir()
	_, bp, err := fsops.Write(root, "new.txt", "data", "utf8", true)
	if err != nil {
		t.Fatalf("Write: %v", err)
	}
	if bp != "" {
		t.Fatalf("expected no backupPath when file didn't exist, got %q", bp)
	}
}

func TestWrite_RejectsEscape(t *testing.T) {
	root := t.TempDir()
	_, _, err := fsops.Write(root, "../evil.txt", "data", "utf8", false)
	if !errors.Is(err, fsops.ErrEscape) {
		t.Fatalf("expected ErrEscape, got %v", err)
	}
}

// ── Mkdir tests ──────────────────────────────────────────────────────────────

func TestMkdir_CreatesNestedDir(t *testing.T) {
	root := t.TempDir()
	if err := fsops.Mkdir(root, "a/b/c"); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	info, err := os.Stat(filepath.Join(root, "a/b/c"))
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	if !info.IsDir() {
		t.Fatal("expected directory")
	}
}

func TestMkdir_RejectsEscape(t *testing.T) {
	root := t.TempDir()
	if err := fsops.Mkdir(root, "../outside"); !errors.Is(err, fsops.ErrEscape) {
		t.Fatalf("expected ErrEscape, got %v", err)
	}
}

// ── Move tests ───────────────────────────────────────────────────────────────

func TestMove_RenamesFile(t *testing.T) {
	root := t.TempDir()
	src := filepath.Join(root, "src.txt")
	if err := os.WriteFile(src, []byte("data"), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if err := fsops.Move(root, "src.txt", "dst.txt"); err != nil {
		t.Fatalf("Move: %v", err)
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Fatal("src should be gone")
	}
	if _, err := os.Stat(filepath.Join(root, "dst.txt")); err != nil {
		t.Fatalf("dst should exist: %v", err)
	}
}

func TestMove_RejectsEscapeFrom(t *testing.T) {
	root := t.TempDir()
	if err := fsops.Move(root, "../evil", "dst.txt"); !errors.Is(err, fsops.ErrEscape) {
		t.Fatalf("expected ErrEscape for from, got %v", err)
	}
}

func TestMove_RejectsEscapeTo(t *testing.T) {
	root := t.TempDir()
	src := filepath.Join(root, "src.txt")
	_ = os.WriteFile(src, []byte("x"), 0644)
	if err := fsops.Move(root, "src.txt", "../evil"); !errors.Is(err, fsops.ErrEscape) {
		t.Fatalf("expected ErrEscape for to, got %v", err)
	}
}

// ── Delete tests ─────────────────────────────────────────────────────────────

func TestDelete_RemovesFile(t *testing.T) {
	root := t.TempDir()
	p := filepath.Join(root, "f.txt")
	_ = os.WriteFile(p, []byte("x"), 0644)
	if err := fsops.Delete(root, "f.txt", false); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := os.Stat(p); !os.IsNotExist(err) {
		t.Fatal("file should be gone")
	}
}

func TestDelete_NonRecursiveErrorsOnNonEmptyDir(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "d")
	_ = os.MkdirAll(filepath.Join(dir, "sub"), 0755)
	if err := fsops.Delete(root, "d", false); err == nil {
		t.Fatal("expected error removing non-empty dir without recursive")
	}
}

func TestDelete_RecursiveSucceeds(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "d")
	_ = os.MkdirAll(filepath.Join(dir, "sub"), 0755)
	_ = os.WriteFile(filepath.Join(dir, "sub", "f.txt"), []byte("x"), 0644)
	if err := fsops.Delete(root, "d", true); err != nil {
		t.Fatalf("Delete recursive: %v", err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatal("dir should be gone")
	}
}

func TestDelete_RejectsEscape(t *testing.T) {
	root := t.TempDir()
	if err := fsops.Delete(root, "../evil", false); !errors.Is(err, fsops.ErrEscape) {
		t.Fatalf("expected ErrEscape, got %v", err)
	}
}
