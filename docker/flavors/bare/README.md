# AgentPod Bare Flavor

Minimal workspace with OpenCode only. No language-specific runtimes installed.

## Use Cases

- **AI-assisted coding** - Let the agent write code, you review
- **Documentation** - Writing docs, READMEs, markdown files
- **Configuration** - YAML, JSON, TOML, INI files
- **Shell scripts** - Bash scripting (bash is included)
- **Learning** - Minimal resource footprint for experimentation
- **Quick prototyping** - Before committing to a language stack

## Included Tools

### From Base Image
- Node.js 22 LTS (for tooling)
- Bun (for ACP Gateway)
- OpenCode CLI
- Git, git-lfs
- Core CLI tools: ripgrep, fd, bat, fzf, jq, yq, tmux

### NOT Included
- Python
- Go
- Rust
- Deno
- Language-specific package managers
- Language-specific linters/formatters

## Resource Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 0.5 cores | 1 core |
| RAM | 768 MB | 1 GB |
| Storage | 5 GB | 10 GB |

## Usage

```bash
docker run -it agentpod-bare:latest
```

## Building

```bash
./docker/scripts/build-flavor.sh bare
```

## When to Use Bare vs Other Flavors

| Scenario | Recommended Flavor |
|----------|-------------------|
| Just need AI to edit files | **Bare** |
| Writing documentation | **Bare** |
| Shell/Bash scripting | **Bare** |
| JavaScript/TypeScript dev | js |
| Python development | python |
| Full-stack web dev | fullstack |
| Multi-language project | polyglot |
