# AgentPod Rust Flavor

Rust development environment.

## Languages

- Rust (stable, via rustup)

## Included Tools

### Core
- rustc (compiler)
- cargo (build tool & package manager)
- rustup (toolchain manager)

### Components
- clippy (linting)
- rustfmt (formatting)
- rust-analyzer (language server)

### Cargo Extensions
- cargo-watch (file watcher)
- cargo-edit (dependency management)
- cargo-audit (security audit)
- cargo-outdated (check updates)
- cargo-nextest (test runner)
- bacon (background checker)

### Other Tools
- just (command runner)
- tokio-console (async debugging)

## Frameworks Supported

- Actix-web
- Axum
- Rocket
- Tokio
- Warp
- Hyper

## Usage

```bash
docker run -it agentpod-rust:latest
```

### Creating a New Project

```bash
cargo new myproject
cd myproject
```

### Live Development

```bash
# Watch for changes and run
cargo watch -x run

# Or use bacon for continuous checking
bacon
```

### Linting

```bash
cargo clippy
```

### Testing

```bash
cargo nextest run
```

### Formatting

```bash
cargo fmt
```

## Building

```bash
./docker/scripts/build-flavor.sh rust
```

## Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `CARGO_HOME` | /home/.cargo | Cargo home |
| `RUSTUP_HOME` | /home/.rustup | Rustup home |
