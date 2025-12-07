# =============================================================================
# OpenCode Desktop Container (Optimized)
# A desktop environment for AI-assisted coding with GUI support
# =============================================================================
# Version: 0.0.1
# Base: Ubuntu 24.04 LTS
# Desktop: Openbox + tint2 (minimal)
# Access: noVNC (web-based VNC)
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
    # X11 virtual framebuffer + VNC
    xvfb x11vnc x11-utils x11-xserver-utils xdotool \
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
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# =============================================================================
# noVNC (web-based VNC client)
# =============================================================================
RUN git clone --branch v1.5.0 --depth 1 https://github.com/novnc/noVNC.git /opt/noVNC && \
    git clone --branch v0.12.0 --depth 1 https://github.com/novnc/websockify /opt/noVNC/utils/websockify && \
    ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html && \
    rm -rf /opt/noVNC/.git /opt/noVNC/utils/websockify/.git

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
    mkdir -p $WORKSPACE && \
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
# Modern CLI tools (combined downloads)
# =============================================================================
RUN curl -LO https://github.com/BurntSushi/ripgrep/releases/download/14.1.0/ripgrep_14.1.0-1_amd64.deb && \
    curl -LO https://github.com/sharkdp/fd/releases/download/v10.1.0/fd_10.1.0_amd64.deb && \
    curl -LO https://github.com/sharkdp/bat/releases/download/v0.24.0/bat_0.24.0_amd64.deb && \
    dpkg -i ripgrep_14.1.0-1_amd64.deb fd_10.1.0_amd64.deb bat_0.24.0_amd64.deb && \
    rm -f *.deb && \
    # fzf
    git clone --depth 1 https://github.com/junegunn/fzf.git /opt/fzf && \
    /opt/fzf/install --bin && \
    ln -s /opt/fzf/bin/fzf /usr/local/bin/fzf && \
    rm -rf /opt/fzf/.git && \
    # yq
    curl -L -o /usr/local/bin/yq https://github.com/mikefarah/yq/releases/download/v4.44.1/yq_linux_amd64 && \
    chmod +x /usr/local/bin/yq

# =============================================================================
# Desktop Configuration
# =============================================================================
USER $USERNAME
WORKDIR $HOME

# Create config directories
RUN mkdir -p $HOME/.config/openbox \
             $HOME/.config/tint2 \
             $HOME/.config/opencode \
             $HOME/.config/opencode-custom \
             $HOME/.local/share/opencode \
             $HOME/.local/share/applications \
             $WORKSPACE

# Copy desktop configuration files
COPY --chown=$USERNAME:$USERNAME config/openbox/ $HOME/.config/openbox/
COPY --chown=$USERNAME:$USERNAME config/tint2/ $HOME/.config/tint2/

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

# VNC/noVNC ports
ENV VNC_PORT=5901
ENV NOVNC_PORT=6080

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
EXPOSE 4096 6080 5901

# =============================================================================
# Health check
# =============================================================================
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -sf http://localhost:${OPENCODE_PORT}/app || exit 1

USER $USERNAME
WORKDIR $WORKSPACE

ENTRYPOINT ["/entrypoint.sh"]
