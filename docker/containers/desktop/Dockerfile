# =============================================================================
# OpenCode Desktop Container (Optimized)
# A desktop environment for AI-assisted coding with GUI support
# =============================================================================
# Version: 0.0.2
# Base: Ubuntu 24.04 LTS
# Desktop: Openbox + tint2 (minimal)
# Access: KasmVNC (modern web-based VNC with better performance)
# =============================================================================

FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV DEBIAN_PRIORITY=high

# =============================================================================
# System + Desktop Packages (combined for fewer layers)
# =============================================================================
RUN apt-get update && apt-get -y upgrade && apt-get install -y --no-install-recommends \
    # Essential utilities
    sudo curl wget ca-certificates gnupg lsb-release \
    software-properties-common locales tzdata \
    # Version control
    git \
    # Editors
    vim nano \
    # Build essentials (minimal)
    build-essential \
    # Compression
    zip unzip xz-utils \
    # Network tools
    net-tools openssh-client \
    # Process management
    htop procps supervisor \
    # File utilities
    tree file less jq \
    # Shell
    tmux \
    # X11 utilities (KasmVNC provides its own X server)
    x11-xserver-utils xdotool \
    # Screenshot tools
    scrot imagemagick \
    # Window manager (minimal)
    openbox tint2 \
    # Desktop utilities
    xterm \
    # File manager
    pcmanfm \
    # Text editor (GUI)
    gedit \
    # Fonts (minimal set)
    fonts-dejavu fonts-liberation \
    # D-Bus
    dbus-x11 \
    # Python (system)
    python3 python3-pip python3-venv \
    # SSL certificates (required for KasmVNC)
    ssl-cert \
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# =============================================================================
# KasmVNC (modern web-based VNC with integrated X server)
# =============================================================================
ARG KASMVNC_VERSION=1.4.0
ARG TARGETARCH
RUN ARCH=$(dpkg --print-architecture) && \
    echo "Installing KasmVNC for architecture: $ARCH" && \
    wget -q https://github.com/kasmtech/KasmVNC/releases/download/v${KASMVNC_VERSION}/kasmvncserver_noble_${KASMVNC_VERSION}_${ARCH}.deb && \
    apt-get update && \
    apt-get install -y --no-install-recommends ./kasmvncserver_noble_${KASMVNC_VERSION}_${ARCH}.deb && \
    rm -f kasmvncserver_noble_${KASMVNC_VERSION}_${ARCH}.deb && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# =============================================================================
# Create developer user with sudo access
# =============================================================================
ENV USERNAME=developer
ENV HOME=/home/$USERNAME
ENV WORKSPACE=/home/$USERNAME/workspace

RUN useradd -m -s /bin/bash -d $HOME $USERNAME && \
    echo "${USERNAME} ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers && \
    # Add user to ssl-cert group for KasmVNC certificate access
    usermod -a -G ssl-cert $USERNAME && \
    mkdir -p $WORKSPACE && \
    mkdir -p $HOME/.cache && \
    mkdir -p $HOME/.config && \
    mkdir -p $HOME/.local/share && \
    chown -R $USERNAME:$USERNAME $HOME

# =============================================================================
# Node.js 22 LTS + OpenCode
# =============================================================================
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install -g pnpm opencode-ai && \
    npm cache clean --force && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# =============================================================================
# Modern CLI tools (combined downloads with architecture support)
# =============================================================================
RUN ARCH=$(dpkg --print-architecture) && \
    # Install ripgrep from apt (works on all architectures)
    apt-get update && \
    apt-get install -y --no-install-recommends ripgrep && \
    # fd and bat - download architecture-specific debs
    curl -LO https://github.com/sharkdp/fd/releases/download/v10.1.0/fd_10.1.0_${ARCH}.deb && \
    curl -LO https://github.com/sharkdp/bat/releases/download/v0.24.0/bat_0.24.0_${ARCH}.deb && \
    dpkg -i fd_10.1.0_${ARCH}.deb bat_0.24.0_${ARCH}.deb && \
    rm -f *.deb && \
    rm -rf /var/lib/apt/lists/* && \
    # fzf
    git clone --depth 1 https://github.com/junegunn/fzf.git /opt/fzf && \
    /opt/fzf/install --bin && \
    ln -s /opt/fzf/bin/fzf /usr/local/bin/fzf && \
    rm -rf /opt/fzf/.git && \
    # yq - architecture-specific binary
    if [ "$ARCH" = "arm64" ]; then YQ_ARCH="arm64"; else YQ_ARCH="amd64"; fi && \
    curl -L -o /usr/local/bin/yq https://github.com/mikefarah/yq/releases/download/v4.44.1/yq_linux_${YQ_ARCH} && \
    chmod +x /usr/local/bin/yq

# =============================================================================
# Code Server (VS Code in browser)
# =============================================================================
RUN curl -fsSL https://code-server.dev/install.sh | sh

# =============================================================================
# Desktop Configuration
# =============================================================================
USER $USERNAME
WORKDIR $HOME

# Create config directories
# - .cache/opencode: for dynamically downloaded provider packages
# - .vnc: KasmVNC configuration directory
RUN mkdir -p $HOME/.config/openbox \
             $HOME/.config/tint2 \
             $HOME/.config/opencode \
             $HOME/.config/opencode-custom \
             $HOME/.local/share/opencode \
             $HOME/.local/share/applications \
             $HOME/.cache/opencode \
             $HOME/.vnc \
             $WORKSPACE

# Copy desktop configuration files
COPY --chown=$USERNAME:$USERNAME config/openbox/ $HOME/.config/openbox/
COPY --chown=$USERNAME:$USERNAME config/tint2/ $HOME/.config/tint2/

# Copy KasmVNC configuration
COPY --chown=$USERNAME:$USERNAME config/kasmvnc.yaml $HOME/.vnc/kasmvnc.yaml
COPY --chown=$USERNAME:$USERNAME config/xstartup $HOME/.vnc/xstartup
RUN chmod +x $HOME/.vnc/xstartup && \
    touch $HOME/.vnc/.de-was-selected

# Create desktop shortcuts
RUN echo '[Desktop Entry]\nType=Application\nName=Terminal\nExec=xterm\nIcon=utilities-terminal' > $HOME/.local/share/applications/terminal.desktop && \
    echo '[Desktop Entry]\nType=Application\nName=File Manager\nExec=pcmanfm\nIcon=system-file-manager' > $HOME/.local/share/applications/files.desktop && \
    echo '[Desktop Entry]\nType=Application\nName=Text Editor\nExec=gedit\nIcon=text-editor' > $HOME/.local/share/applications/editor.desktop

# Set up shell configuration
RUN echo 'export PATH="$HOME/.local/bin:$PATH"' >> $HOME/.bashrc && \
    echo 'export EDITOR=vim' >> $HOME/.bashrc && \
    echo 'export DISPLAY=:1' >> $HOME/.bashrc && \
    echo '[ -f /opt/fzf/shell/key-bindings.bash ] && source /opt/fzf/shell/key-bindings.bash' >> $HOME/.bashrc

# =============================================================================
# Environment variables
# =============================================================================
ENV OPENCODE_PORT=4096
ENV OPENCODE_HOST=0.0.0.0
ENV OPENCODE_CONFIG_DIR=/home/developer/.config/opencode-custom
ENV TERM=xterm-256color

# Display configuration
ENV DISPLAY_NUM=1
ENV DISPLAY=:1
ENV WIDTH=1280
ENV HEIGHT=800

# KasmVNC web port
ENV KASMVNC_PORT=6080

# Code Server configuration
ENV CODE_SERVER_PORT=8080
ENV CODE_SERVER_AUTH=none

# =============================================================================
# Copy entrypoint and supervisor config
# =============================================================================
USER root
COPY entrypoint.sh /entrypoint.sh
COPY config/supervisord.conf /etc/supervisor/conf.d/desktop.conf
RUN chmod +x /entrypoint.sh

# =============================================================================
# Expose ports
# =============================================================================
# 4096: OpenCode server
# 6080: KasmVNC web interface
# 8080: Code Server
EXPOSE 4096 6080 8080

# =============================================================================
# Health check
# =============================================================================
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -sf http://localhost:${OPENCODE_PORT}/app || exit 1

USER $USERNAME
WORKDIR $WORKSPACE

ENTRYPOINT ["/entrypoint.sh"]
