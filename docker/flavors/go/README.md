# AgentPod Go Flavor

Go development environment.

## Languages

- Go 1.22

## Included Tools

### Core
- go (compiler, build tool)
- gofmt (formatting)
- go vet (static analysis)

### Development Tools
- gopls (language server)
- dlv (debugger)
- golangci-lint (linting)
- air (live reload)
- swag (Swagger docs)
- mockgen (mocking)
- gotestsum (test runner)

## Frameworks Supported

- Gin
- Echo
- Fiber
- Chi
- Gorilla Mux
- net/http (stdlib)

## Usage

```bash
docker run -it codeopen-go:latest
```

### Creating a New Module

```bash
go mod init myproject
```

### Running with Live Reload

```bash
air
```

### Linting

```bash
golangci-lint run
```

### Testing

```bash
gotestsum ./...
```

## Building

```bash
./docker/scripts/build-flavor.sh go
```

## Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `GOROOT` | /usr/local/go | Go installation |
| `GOPATH` | /home/go | Go workspace |
