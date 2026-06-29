#!/bin/sh
set -e

# Create the workspace directory that OpenCode will manage.
mkdir -p /workspace

# Register /workspace as an OpenCode project so agentpod-node detect lists it.
#
# The node-agent descriptor (internal/descriptor/opencode.go) discovers projects
# via TWO mechanisms (primary first, fallback second):
#
#   PRIMARY:  SELECT worktree FROM project WHERE id != 'global' AND worktree != ''
#             in ~/.local/share/opencode/opencode.db
#
#   FALLBACK: enumerate ~/.local/share/opencode/project/ directories; each subdir
#             name is a sanitised workspace path (leading '/' stripped, '/' → '-'),
#             e.g. /workspace → "workspace".
#
# We seed BOTH so detection works regardless of whether sqlite3 is available.

OPENCODE_DATA="${HOME:-/root}/.local/share/opencode"
OPENCODE_DB="${OPENCODE_DATA}/opencode.db"

# Create the data-dir structure opencode.go's Detect() requires.
mkdir -p "${OPENCODE_DATA}/project/workspace"

# PRIMARY: seed opencode.db with a project row for /workspace.
# Schema matches the real opencode.db (id text PK, worktree text NOT NULL,
# sandboxes text NOT NULL, time_created/time_updated integer NOT NULL).
sqlite3 "${OPENCODE_DB}" <<'SQL'
CREATE TABLE IF NOT EXISTS project (
  id            text    PRIMARY KEY,
  worktree      text    NOT NULL,
  vcs           text,
  name          text,
  icon_url      text,
  icon_color    text,
  time_created  integer NOT NULL,
  time_updated  integer NOT NULL,
  time_initialized integer,
  sandboxes     text    NOT NULL,
  commands      text
);
INSERT OR IGNORE INTO project
  (id, worktree, time_created, time_updated, sandboxes)
VALUES
  ('agentpod-workspace', '/workspace', unixepoch() * 1000, unixepoch() * 1000, '[]');
SQL

# Enroll reads AGENTPOD_HUB_URL and AGENTPOD_ENROLL_TOKEN from the environment.
/agentpod-node enroll

# Hand off to the run loop.
exec /agentpod-node run
