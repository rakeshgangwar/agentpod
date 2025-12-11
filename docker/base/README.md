# CodeOpen Base Image

Foundation layer for all CodeOpen container flavors.

## Contents

- **Ubuntu 24.04 LTS** - Base OS
- **Node.js 22 LTS** - JavaScript runtime
- **Bun** - Fast JavaScript runtime for ACP Gateway
- **OpenCode CLI** - Default AI coding agent
- **ACP Gateway** - Multi-agent orchestration service
- **Core CLI Tools** - git, ripgrep, fd, bat, fzf, jq, yq

## Ports

| Port | Service | Description |
|------|---------|-------------|
| 4096 | OpenCode | OpenCode server (when started) |
| 4097 | ACP Gateway | Agent Client Protocol gateway |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_PORT` | 4096 | OpenCode server port |
| `ACP_GATEWAY_PORT` | 4097 | ACP Gateway port |
| `OPENCODE_HOST` | 0.0.0.0 | Bind address |
| `WORKSPACE` | /home/developer/workspace | Project workspace |
| `OPENCODE_AUTH_JSON` | - | LLM provider credentials |
| `OPENCODE_CONFIG_JSON` | - | OpenCode configuration |
| `FORGEJO_REPO_URL` | - | Git repository to clone |
| `FORGEJO_USER` | - | Git authentication username |
| `FORGEJO_TOKEN` | - | Git authentication token |

## Usage

This image is not meant to be used directly. Use one of the flavor images instead:

- `codeopen-js` - JavaScript/TypeScript development
- `codeopen-python` - Python development
- `codeopen-go` - Go development
- `codeopen-rust` - Rust development
- `codeopen-fullstack` - JavaScript + Python
- `codeopen-polyglot` - All languages

## Building

```bash
# From docker/ directory
./scripts/build-base.sh

# Or manually
docker build -t codeopen-base:latest ./codeopen-base/
```

## Extending

To create a new flavor:

```dockerfile
ARG BASE_IMAGE=codeopen-base:latest
FROM ${BASE_IMAGE}

# Add your language-specific packages
USER root
RUN apt-get update && apt-get install -y your-packages

USER developer
```

## ACP Gateway

The ACP Gateway runs on port 4097 and provides:

- Multi-agent support (OpenCode, Claude Code, Gemini CLI, etc.)
- HTTP API for agent management
- SSE event streaming
- File system operations

### Health Check

```bash
curl http://localhost:4097/health
```

### List Agents

```bash
curl http://localhost:4097/agents
```

## Directory Structure

```
/home/developer/
├── workspace/              # Project files
├── .config/
│   ├── opencode/          # OpenCode configuration
│   └── opencode-custom/   # Custom configurations
├── .local/share/opencode/ # OpenCode data (auth.json)
└── .cache/opencode/       # OpenCode cache

/opt/
├── acp-gateway/           # ACP Gateway source
└── codeopen/scripts/      # Shared scripts
```
