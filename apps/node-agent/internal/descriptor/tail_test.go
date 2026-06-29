package descriptor

import (
	"fmt"
	"os"
	"strings"
	"testing"
)

// TestLastNLines_LargeFile verifies that a file with 5000 lines returns only
// the last 500 when n=500 and maxBytes is large enough to include all of them.
func TestLastNLines_LargeFile(t *testing.T) {
	f, err := os.CreateTemp("", "tail-test-*.log")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())

	for i := 1; i <= 5000; i++ {
		fmt.Fprintf(f, "line %d\n", i)
	}
	f.Close()

	data, err := lastNLines(f.Name(), 500, 256*1024)
	if err != nil {
		t.Fatalf("lastNLines: %v", err)
	}

	got := strings.TrimRight(string(data), "\n")
	lines := strings.Split(got, "\n")

	if len(lines) != 500 {
		t.Fatalf("want 500 lines, got %d (first=%q last=%q)", len(lines), lines[0], lines[len(lines)-1])
	}
	if lines[0] != "line 4501" {
		t.Errorf("first line: want 'line 4501', got %q", lines[0])
	}
	if lines[len(lines)-1] != "line 5000" {
		t.Errorf("last line: want 'line 5000', got %q", lines[len(lines)-1])
	}
}

// TestLastNLines_SmallFile verifies that a file with fewer lines than n
// returns all of them.
func TestLastNLines_SmallFile(t *testing.T) {
	f, err := os.CreateTemp("", "tail-test-small-*.log")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())

	for i := 1; i <= 10; i++ {
		fmt.Fprintf(f, "line %d\n", i)
	}
	f.Close()

	data, err := lastNLines(f.Name(), 500, 256*1024)
	if err != nil {
		t.Fatalf("lastNLines small: %v", err)
	}

	got := strings.TrimRight(string(data), "\n")
	lines := strings.Split(got, "\n")

	if len(lines) != 10 {
		t.Fatalf("want 10 lines, got %d", len(lines))
	}
	if lines[0] != "line 1" {
		t.Errorf("first line: want 'line 1', got %q", lines[0])
	}
	if lines[9] != "line 10" {
		t.Errorf("last line: want 'line 10', got %q", lines[9])
	}
}

// TestLastNLines_EmptyFile verifies that an empty file returns nil data with
// no error.
func TestLastNLines_EmptyFile(t *testing.T) {
	f, err := os.CreateTemp("", "tail-test-empty-*.log")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())
	f.Close()

	data, err := lastNLines(f.Name(), 500, 256*1024)
	if err != nil {
		t.Fatalf("lastNLines empty: %v", err)
	}
	if len(data) != 0 {
		t.Errorf("expected empty data for empty file, got %d bytes", len(data))
	}
}

// TestLastNLines_ByteCapKeepsWholeLines verifies that when maxBytes forces a
// mid-file seek, the first returned line is always a whole line (no partial
// first line) and the result does not exceed maxBytes.
func TestLastNLines_ByteCapKeepsWholeLines(t *testing.T) {
	f, err := os.CreateTemp("", "tail-test-bytecap-*.log")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())

	// Write 5000 lines (~49 KB total; each line 7-10 bytes).
	for i := 1; i <= 5000; i++ {
		fmt.Fprintf(f, "line %d\n", i)
	}
	f.Close()

	// maxBytes=1000 forces a mid-file seek, capping to ~100 lines rather than 500.
	const maxBytes int64 = 1000
	data, err := lastNLines(f.Name(), 500, maxBytes)
	if err != nil {
		t.Fatalf("lastNLines bytecap: %v", err)
	}

	// Result must not exceed maxBytes.
	if int64(len(data)) > maxBytes {
		t.Errorf("data len %d exceeds maxBytes %d", len(data), maxBytes)
	}

	// Every returned line must be a whole "line N" line.
	got := strings.TrimRight(string(data), "\n")
	lines := strings.Split(got, "\n")
	for i, l := range lines {
		if !strings.HasPrefix(l, "line ") {
			t.Errorf("line[%d] is not a whole line: %q", i, l)
		}
	}

	// Must have at least some lines.
	if len(lines) == 0 {
		t.Error("expected at least one line with maxBytes=1000")
	}
}
