package terminal

import (
	"fmt"
	"sync"
)

// Manager owns the set of live PTY sessions keyed both by session ID and by
// station key.  All public methods are safe for concurrent use.
type Manager struct {
	mu      sync.Mutex
	byID    map[string]*Session
	byKey   map[string]string // station key → session ID
	counter int               // monotonic counter for deterministic IDs
}

// NewManager allocates an empty Manager.
func NewManager() *Manager {
	return &Manager{
		byID:  make(map[string]*Session),
		byKey: make(map[string]string),
	}
}

// Open returns the live session for key if one already exists (idempotent), or
// spawns a new one.  shell defaults to "/bin/sh" when empty.  cwd sets the
// working directory of the spawned process.
func (m *Manager) Open(key, shell, cwd string, cols, rows uint16) (*Session, error) {
	m.mu.Lock()
	// Fast path: session already alive for this key.
	if id, ok := m.byKey[key]; ok {
		if s, ok := m.byID[id]; ok {
			m.mu.Unlock()
			return s, nil
		}
	}
	// Reserve an ID atomically so concurrent opens get distinct IDs.
	m.counter++
	id := fmt.Sprintf("sess-%d", m.counter)
	m.mu.Unlock()

	// Spawn the session outside the lock (process creation may be slow).
	s, err := newSession(id, shell, cwd, cols, rows)
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	// Double-check: another goroutine may have won the race for this key.
	if existingID, ok := m.byKey[key]; ok {
		if existing, ok := m.byID[existingID]; ok {
			m.mu.Unlock()
			// We lost the race — discard our session.
			_ = s.Close()
			return existing, nil
		}
	}
	m.byID[id] = s
	m.byKey[key] = id
	m.mu.Unlock()
	return s, nil
}

// Get looks up a session by its ID.
func (m *Manager) Get(id string) (*Session, bool) {
	m.mu.Lock()
	s, ok := m.byID[id]
	m.mu.Unlock()
	return s, ok
}

// GetByKey looks up a session by station key.
func (m *Manager) GetByKey(key string) (*Session, bool) {
	m.mu.Lock()
	id, ok := m.byKey[key]
	if !ok {
		m.mu.Unlock()
		return nil, false
	}
	s, ok2 := m.byID[id]
	m.mu.Unlock()
	return s, ok2
}

// Close removes the session from both indexes, kills the process, and waits
// for the read loop to exit.  Returns nil if no session with that ID exists.
func (m *Manager) Close(id string) error {
	m.mu.Lock()
	s, ok := m.byID[id]
	if !ok {
		m.mu.Unlock()
		return nil
	}
	delete(m.byID, id)
	// Remove from the key→id reverse index.
	for k, v := range m.byKey {
		if v == id {
			delete(m.byKey, k)
			break
		}
	}
	m.mu.Unlock()
	return s.Close()
}

// Shutdown closes all live sessions.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	sessions := make([]*Session, 0, len(m.byID))
	for _, s := range m.byID {
		sessions = append(sessions, s)
	}
	m.byID = make(map[string]*Session)
	m.byKey = make(map[string]string)
	m.mu.Unlock()

	for _, s := range sessions {
		_ = s.Close()
	}
}
