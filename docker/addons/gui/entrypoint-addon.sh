#!/bin/bash
# =============================================================================
# GUI Add-on Entrypoint Extension
# This script is sourced by the main entrypoint to start GUI services
# =============================================================================

setup_gui() {
    echo "Setting up GUI add-on (KasmVNC)..."
    
    VNC_DIR="${HOME_DIR:-/home/developer}/.vnc"
    mkdir -pm700 "$VNC_DIR"
    
    # Ensure .de-was-selected exists (prevents DE selection prompt)
    touch "$VNC_DIR/.de-was-selected"
    
    # Update kasmvnc.yaml with current resolution settings
    if [ -f "$VNC_DIR/kasmvnc.yaml" ]; then
        if command -v yq &> /dev/null; then
            yq -i ".desktop.resolution.width = ${WIDTH:-1280}" "$VNC_DIR/kasmvnc.yaml"
            yq -i ".desktop.resolution.height = ${HEIGHT:-800}" "$VNC_DIR/kasmvnc.yaml"
            yq -i ".network.websocket_port = ${KASMVNC_PORT:-6080}" "$VNC_DIR/kasmvnc.yaml"
        fi
    fi
    
    # Create KasmVNC password file (required even with -disableBasicAuth)
    echo -e "kasmvnc\nkasmvnc\n" | vncpasswd -u developer -ow 2>/dev/null || true
    
    echo "  KasmVNC configured."
}

start_gui() {
    echo "Starting GUI services (KasmVNC)..."
    
    # Export environment variables for supervisor
    export WIDTH="${WIDTH:-1280}"
    export HEIGHT="${HEIGHT:-800}"
    export DISPLAY_NUM="${DISPLAY_NUM:-1}"
    export KASMVNC_PORT="${KASMVNC_PORT:-6080}"
    
    # Start KasmVNC via supervisor
    /usr/bin/supervisord -c /etc/supervisor/conf.d/gui.conf
    
    # Wait for KasmVNC to be ready
    sleep 3
    
    echo "  GUI services started."
    echo "  Desktop available at: http://localhost:${KASMVNC_PORT}"
}

# Export functions for main entrypoint
export -f setup_gui
export -f start_gui
