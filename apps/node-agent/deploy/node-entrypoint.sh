#!/bin/sh
set -e

# Enroll reads AGENTPOD_HUB_URL and AGENTPOD_ENROLL_TOKEN from the environment.
/agentpod-node enroll

# Hand off to the run loop.
exec /agentpod-node run
