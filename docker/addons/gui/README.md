# CodeOpen GUI Add-on

Desktop environment with web-based access via KasmVNC.

## Features

- **Window Manager**: Openbox (minimal, fast)
- **Panel**: tint2 (taskbar with clock)
- **Access**: KasmVNC web interface (no VNC client needed)
- **Applications**: Terminal (xterm), File Manager (pcmanfm), Text Editor (gedit)

## Ports

| Port | Service |
|------|---------|
| 6080 | KasmVNC Web Interface |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DISPLAY_NUM` | 1 | X display number |
| `WIDTH` | 1280 | Screen width in pixels |
| `HEIGHT` | 800 | Screen height in pixels |
| `KASMVNC_PORT` | 6080 | KasmVNC web port |

## Usage

### Access Desktop

Open your browser to `http://localhost:6080` to access the desktop environment.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+T` | Open terminal |
| `Alt+E` | Open file manager |
| `Alt+F4` | Close window |
| `Alt+F10` | Toggle maximize |
| Right-click on desktop | Open menu |

### Running GUI Applications

GUI applications can be launched from the menu or terminal:

```bash
# Open file manager
pcmanfm

# Open text editor
gedit myfile.txt

# Take screenshot
scrot screenshot.png
```

## Image Size

Adds approximately 800MB to the flavor image size.

## Building

```bash
# Build with fullstack flavor as base
./docker/scripts/build-addon.sh gui --base codeopen-fullstack:latest

# Build with specific flavor
./docker/scripts/build-addon.sh gui --base codeopen-python:latest
```

## Notes

- KasmVNC runs without authentication by default (reverse proxy should handle auth)
- The GUI add-on is optional - most development can be done via terminal
- Useful for testing browser applications, running GUI tools, or visual debugging
