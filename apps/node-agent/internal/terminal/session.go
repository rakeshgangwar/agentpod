// Package terminal provides a PTY-backed terminal session manager with
// ring-buffer scrollback and multi-subscriber pub/sub.
package terminal

import (
	"context"
	"os"
	"os/exec"
	"sync"
	"syscall"

	"github.com/creack/pty"
)

// ringBytes is the maximum number of bytes kept in the scrollback ring buffer.
const ringBytes = 256 * 1024

// subscriber holds a channel that receives PTY output chunks.
type subscriber struct {
	ch chan []byte
}

// Session wraps a single PTY process. It is safe for concurrent use.
type Session struct {
	// ID is the unique session identifier (e.g. "sess-1").
	ID string

	ptm *os.File
	cmd *exec.Cmd

	mu     sync.Mutex
	ring   []byte          // scrollback ring buffer (last ringBytes)
	subs   map[int]*subscriber
	subSeq int             // monotonic key for subs map

	cancel context.CancelFunc
	done   chan struct{} // closed when the read loop exits
}

// newSession spawns a PTY-attached process and returns a running Session.
// When using a PTY, the child becomes a session leader automatically
// (the PTY slave is its controlling terminal), so we do NOT set Setpgid —
// it conflicts with the PTY allocation on macOS.
func newSession(id, shell, cwd string, cols, rows uint16) (*Session, error) {
	if shell == "" {
		shell = "/bin/sh"
	}

	cmd := exec.Command(shell)
	cmd.Dir = cwd

	size := &pty.Winsize{Cols: cols, Rows: rows}
	ptm, err := pty.StartWithSize(cmd, size)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithCancel(context.Background())
	s := &Session{
		ID:     id,
		ptm:    ptm,
		cmd:    cmd,
		subs:   make(map[int]*subscriber),
		cancel: cancel,
		done:   make(chan struct{}),
	}
	go s.readLoop(ctx)
	return s, nil
}

// readLoop copies PTY output into the ring buffer and every subscriber channel.
// It exits when the PTY file returns an error (closed or EOF) or ctx is done.
func (s *Session) readLoop(ctx context.Context) {
	defer close(s.done)

	buf := make([]byte, 4096)
	for {
		n, err := s.ptm.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])

			s.mu.Lock()
			// Append to ring; keep only the last ringBytes.
			s.ring = appendRing(s.ring, chunk)
			// Fan out to subscribers — non-blocking; drop on slow consumer.
			for _, sub := range s.subs {
				select {
				case sub.ch <- chunk:
				default:
				}
			}
			s.mu.Unlock()
		}
		if err != nil {
			break
		}
	}

	// Notify remaining subscribers that the session has ended.
	s.mu.Lock()
	for id, sub := range s.subs {
		close(sub.ch)
		delete(s.subs, id)
	}
	s.mu.Unlock()
}

// appendRing appends data to buf and trims to the last ringBytes bytes.
func appendRing(buf, data []byte) []byte {
	buf = append(buf, data...)
	if len(buf) > ringBytes {
		buf = buf[len(buf)-ringBytes:]
	}
	return buf
}

// Write sends p to the PTY's stdin.
func (s *Session) Write(p []byte) error {
	_, err := s.ptm.Write(p)
	return err
}

// Resize sets the PTY window size.
func (s *Session) Resize(cols, rows uint16) error {
	return pty.Setsize(s.ptm, &pty.Winsize{Cols: cols, Rows: rows})
}

// Subscribe returns a channel that receives PTY output and an unsubscribe
// function. On subscribe, the current ring-buffer contents are delivered as
// the first message (scrollback replay); subsequent messages are live output.
// The channel is buffered; on a slow consumer, live chunks are DROPPED rather
// than blocking the PTY read loop. Calling the returned func detaches this
// subscriber without closing the session.
func (s *Session) Subscribe() (<-chan []byte, func()) {
	// Buffer must be large enough to accept the replay chunk without blocking
	// while we still hold the lock.
	ch := make(chan []byte, 128)

	s.mu.Lock()
	// Deliver a snapshot of the scrollback ring as the first message.
	if len(s.ring) > 0 {
		snap := make([]byte, len(s.ring))
		copy(snap, s.ring)
		ch <- snap // always succeeds: fresh channel, guaranteed capacity >= 1
	}
	// Register the subscriber so the read loop starts delivering live chunks.
	id := s.subSeq
	s.subSeq++
	s.subs[id] = &subscriber{ch: ch}
	s.mu.Unlock()

	unsub := func() {
		s.mu.Lock()
		delete(s.subs, id)
		s.mu.Unlock()
	}
	return ch, unsub
}

// Close kills the child process (by its process group) and closes the PTY
// file. It blocks until the read loop has exited to avoid goroutine leaks.
func (s *Session) Close() error {
	s.cancel()

	// PTY-started processes become their own session / process group leader,
	// so pgid == pid. Kill the whole group to reap any grandchildren.
	if s.cmd.Process != nil {
		pgid, err := syscall.Getpgid(s.cmd.Process.Pid)
		if err == nil {
			_ = syscall.Kill(-pgid, syscall.SIGKILL)
		} else {
			_ = s.cmd.Process.Kill()
		}
	}

	// Closing the master PTY causes Read in the read loop to fail, stopping
	// the loop.
	err := s.ptm.Close()

	// Wait for the read loop to exit — no goroutine leak.
	<-s.done

	// Reap the child to avoid zombies.
	_ = s.cmd.Wait()

	return err
}
