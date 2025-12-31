# CodeOpen Code Server Add-on

VS Code in the browser via code-server.

## Features

- Full VS Code experience in browser
- Extension support
- Terminal integration
- No local installation required

## Ports

| Port | Service |
|------|---------|
| 8080 | Code Server Web Interface |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CODE_SERVER_PORT` | 8080 | Web interface port |
| `CODE_SERVER_AUTH` | none | Authentication mode (none, password) |
| `CODE_SERVER_PASSWORD` | - | Password (when auth=password) |

## Pre-installed Extensions

- Python (ms-python.python)
- Tailwind CSS (bradlc.vscode-tailwindcss)
- Prettier (esbenp.prettier-vscode)
- ESLint (dbaeumer.vscode-eslint)

## Usage

### Access Code Server

Open your browser to `http://localhost:8080` to access VS Code.

### Installing Additional Extensions

From the terminal inside the container:

```bash
code-server --install-extension <extension-id>
```

Or use the Extensions panel in the web UI.

### With Authentication

```bash
docker run -e CODE_SERVER_AUTH=password -e CODE_SERVER_PASSWORD=secret ...
```

## Image Size

Adds approximately 300MB to the flavor image size.

## Building

```bash
./docker/scripts/build-addon.sh code-server --base codeopen-fullstack:latest
```

## Notes

- Code Server runs without authentication by default
- For production, enable authentication or use a reverse proxy with auth
- Settings sync is not available (it's a local installation)
