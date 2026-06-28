// Package fsops provides path-jailed filesystem write operations for the
// node-agent. All operations validate that the resolved path stays within the
// station's workspace root before touching the filesystem.
//
// The Jail function is the security core: it combines filepath.Clean-based
// prefix checking with EvalSymlinks on the deepest existing ancestor to defeat
// both traversal (../) and symlink-escape attacks.
package fsops

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ErrEscape is returned by Jail when the resolved path would escape the root.
var ErrEscape = errors.New("path escapes workspace")

// Jail resolves rel against root and returns the absolute path if and only if
// it stays within root. Two checks are applied:
//
//  1. String-prefix check after filepath.Clean — catches ".." traversal.
//  2. EvalSymlinks on the deepest existing ancestor — catches symlink escapes.
//
// root must exist; root symlinks are resolved once up front so all comparisons
// are canonical.
func Jail(root, rel string) (string, error) {
	// Absolute rel paths are always rejected: callers must use relative paths.
	if filepath.IsAbs(rel) {
		return "", ErrEscape
	}

	// Normalize root (resolve symlinks so comparisons are canonical).
	resolvedRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", fmt.Errorf("jail: eval root %q: %w", root, err)
	}

	// Build and clean the candidate path using the canonical root.
	clean := filepath.Clean(filepath.Join(resolvedRoot, rel))

	// ── Check 1: string-prefix (catches ".." traversal) ───────────────────────
	if clean != resolvedRoot && !strings.HasPrefix(clean, resolvedRoot+string(os.PathSeparator)) {
		return "", ErrEscape
	}

	// ── Check 2: symlink escape — EvalSymlinks the deepest existing ancestor ──
	// Walk up from clean until we reach an existing filesystem entry (or root).
	ancestor := clean
	for {
		if _, lerr := os.Lstat(ancestor); lerr == nil {
			break // found an existing path
		}
		parent := filepath.Dir(ancestor)
		if parent == ancestor {
			// Reached the filesystem root without finding anything existing.
			// There are no symlinks to follow, so string-prefix check is sufficient.
			return clean, nil
		}
		ancestor = parent
	}

	// Resolve all symlinks in the existing ancestor.
	resolvedAncestor, err := filepath.EvalSymlinks(ancestor)
	if err != nil {
		return "", fmt.Errorf("jail: eval ancestor %q: %w", ancestor, err)
	}

	// The resolved ancestor must still be within resolvedRoot.
	if resolvedAncestor != resolvedRoot && !strings.HasPrefix(resolvedAncestor, resolvedRoot+string(os.PathSeparator)) {
		return "", ErrEscape
	}

	return clean, nil
}

// Write writes content to root/rel, creating parent directories as needed.
// If encoding is "base64", content is base64-decoded first; otherwise it is
// treated as UTF-8 text. If backup is true and the file already exists, the
// current file is copied to <path>.<RFC3339-timestamp>.bak before writing.
// Returns the number of bytes written and the backup path (empty if no backup).
func Write(root, rel, content, encoding string, backup bool) (n int, backupPath string, err error) {
	p, err := Jail(root, rel)
	if err != nil {
		return 0, "", err
	}

	// Decode content.
	var data []byte
	switch encoding {
	case "base64":
		data, err = base64.StdEncoding.DecodeString(content)
		if err != nil {
			return 0, "", fmt.Errorf("fsops write: base64 decode: %w", err)
		}
	default: // "utf8" or anything else — treat as UTF-8 text
		data = []byte(content)
	}

	// Ensure parent directories exist.
	if err = os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return 0, "", fmt.Errorf("fsops write: mkdir parent: %w", err)
	}

	// Backup existing file if requested.
	if backup {
		if _, serr := os.Stat(p); serr == nil {
			// File exists — copy it to a .bak path.
			ts := time.Now().UTC().Format(time.RFC3339)
			bPath := p + "." + ts + ".bak"
			if copyErr := copyFile(p, bPath); copyErr != nil {
				return 0, "", fmt.Errorf("fsops write: backup: %w", copyErr)
			}
			backupPath = bPath
		}
	}

	// Write (create or truncate).
	if err = os.WriteFile(p, data, 0644); err != nil {
		return 0, "", fmt.Errorf("fsops write: %w", err)
	}

	return len(data), backupPath, nil
}

// Mkdir creates the directory at root/rel and all necessary parents (0755).
func Mkdir(root, rel string) error {
	p, err := Jail(root, rel)
	if err != nil {
		return err
	}
	return os.MkdirAll(p, 0755)
}

// Move renames root/from to root/to. Both paths are jailed.
func Move(root, from, to string) error {
	fromPath, err := Jail(root, from)
	if err != nil {
		return fmt.Errorf("fsops move from: %w", err)
	}
	toPath, err := Jail(root, to)
	if err != nil {
		return fmt.Errorf("fsops move to: %w", err)
	}
	return os.Rename(fromPath, toPath)
}

// Delete removes root/rel. If recursive is true it removes the entire tree
// (os.RemoveAll); otherwise it calls os.Remove, which errors on a non-empty
// directory — the desired behaviour for safety.
func Delete(root, rel string, recursive bool) error {
	p, err := Jail(root, rel)
	if err != nil {
		return err
	}
	if recursive {
		return os.RemoveAll(p)
	}
	return os.Remove(p)
}

// copyFile copies src to dst (creating dst, 0644).
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}
