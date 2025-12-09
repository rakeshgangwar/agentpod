# =============================================================================
# CodeOpen GUI Add-on
# Adds desktop environment with KasmVNC web access
# =============================================================================
# Size: ~800MB (on top of flavor image)
# Desktop: Openbox + tint2 (minimal)
# Access: KasmVNC (web-based VNC with modern features)
# Port: 6080 (KasmVNC web interface)
# =============================================================================

ARG BASE_IMAGE=codeopen-fullstack:latest
FROM ${BASE_IMAGE}

LABEL maintainer="CodeOpen Team"
LABEL description="GUI add-on with KasmVNC desktop environment"
LABEL addon="gui"

USER root

# =============================================================================
# Desktop Environment Packages
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    # X11 utilities (KasmVNC provides its own X server)
    x11-xserver-utils \
    xdotool \
    # Screenshot tools
    scrot \
    imagemagick \
    # Window manager (minimal)
    openbox \
    tint2 \
    # Desktop utilities
    xterm \
    # File manager
    pcmanfm \
    # Text editor (GUI)
    gedit \
    # Fonts (minimal set)
    fonts-dejavu \
    fonts-liberation \
    # D-Bus
    dbus-x11 \
    # SSL certificates (required for KasmVNC)
    ssl-cert \
    # Process management
    supervisor \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# =============================================================================
# KasmVNC (modern web-based VNC with integrated X server)
# =============================================================================
ARG KASMVNC_VERSION=1.4.0
RUN ARCH=$(dpkg --print-architecture) && \
    echo "Installing KasmVNC for architecture: $ARCH" && \
    wget -q https://github.com/kasmtech/KasmVNC/releases/download/v${KASMVNC_VERSION}/kasmvncserver_noble_${KASMVNC_VERSION}_${ARCH}.deb && \
    apt-get update && \
    apt-get install -y --no-install-recommends ./kasmvncserver_noble_${KASMVNC_VERSION}_${ARCH}.deb && \
    rm -f kasmvncserver_noble_${KASMVNC_VERSION}_${ARCH}.deb && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Add developer user to ssl-cert group for KasmVNC certificate access
RUN usermod -a -G ssl-cert developer

# =============================================================================
# Desktop Configuration
# =============================================================================
USER developer
WORKDIR /home/developer

# Create config directories
RUN mkdir -p /home/developer/.config/openbox \
             /home/developer/.config/tint2 \
             /home/developer/.local/share/applications \
             /home/developer/.vnc

# Copy desktop configuration files
COPY --chown=developer:developer config/openbox/ /home/developer/.config/openbox/
COPY --chown=developer:developer config/tint2/ /home/developer/.config/tint2/

# Copy KasmVNC configuration
COPY --chown=developer:developer config/kasmvnc.yaml /home/developer/.vnc/kasmvnc.yaml
COPY --chown=developer:developer config/xstartup /home/developer/.vnc/xstartup
RUN chmod +x /home/developer/.vnc/xstartup && \
    touch /home/developer/.vnc/.de-was-selected

# Create desktop shortcuts
RUN echo '[Desktop Entry]\nType=Application\nName=Terminal\nExec=xterm\nIcon=utilities-terminal' > /home/developer/.local/share/applications/terminal.desktop && \
    echo '[Desktop Entry]\nType=Application\nName=File Manager\nExec=pcmanfm\nIcon=system-file-manager' > /home/developer/.local/share/applications/files.desktop && \
    echo '[Desktop Entry]\nType=Application\nName=Text Editor\nExec=gedit\nIcon=text-editor' > /home/developer/.local/share/applications/editor.desktop

# Add display settings to bashrc
RUN echo 'export DISPLAY=:1' >> /home/developer/.bashrc

# =============================================================================
# Supervisor Configuration
# =============================================================================
USER root
COPY config/supervisord.conf /etc/supervisor/conf.d/gui.conf

# =============================================================================
# Environment variables
# =============================================================================
ENV DISPLAY_NUM=1
ENV DISPLAY=:1
ENV WIDTH=1280
ENV HEIGHT=800
ENV KASMVNC_PORT=6080

# =============================================================================
# Add-on metadata
# =============================================================================
ENV CODEOPEN_ADDON_GUI="true"
ENV CODEOPEN_GUI_PORT=6080

# =============================================================================
# Expose ports
# =============================================================================
# 6080: KasmVNC web interface
EXPOSE 6080

USER developer
WORKDIR /home/developer/workspace
