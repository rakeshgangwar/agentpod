# =============================================================================
# OpenCode Desktop Container
# A full desktop environment for AI-assisted coding with GUI support
# Based on Anthropic's computer-use-demo approach
# =============================================================================
# Version: 0.0.1
# Base: Ubuntu 24.04 LTS
# Desktop: Openbox + tint2 (minimal, like Anthropic's approach)
# Access: noVNC (web-based VNC)
# License: MIT
# =============================================================================

FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV DEBIAN_PRIORITY=high

# =============================================================================
# System Packages (same as CLI + desktop components)
# =============================================================================
RUN apt-get update && apt-get -y upgrade && apt-get install -y \
    # Essential utilities
    sudo \
    curl \
    wget \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    apt-transport-https \
    locales \
    tzdata \
    # Version control
    git \
    git-lfs \
    # Editors
    vim \
    nano \
    # Build essentials
    build-essential \
    cmake \
    make \
    pkg-config \
    autoconf \
    automake \
    libtool \
    # SSL/Crypto libraries
    libssl-dev \
    libffi-dev \
    # Compression
    zip \
    unzip \
    p7zip-full \
    xz-utils \
    # Network tools
    net-tools \
    netcat-openbsd \
    dnsutils \
    iputils-ping \
    openssh-client \
    # Process management
    htop \
    procps \
    supervisor \
    # File utilities
    tree \
    file \
    less \
    # JSON/YAML processing
    jq \
    # Python build dependencies
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libncursesw5-dev \
    libxml2-dev \
    libxmlsec1-dev \
    liblzma-dev \
    tk-dev \
    # Shell
    zsh \
    tmux \
    # =============================================================================
    # Desktop/GUI Requirements (Anthropic-style)
    # =============================================================================
    # X11 virtual framebuffer
    xvfb \
    # VNC server
    x11vnc \
    # X11 utilities
    x11-utils \
    x11-xserver-utils \
    xdotool \
    # Screenshot tools
    scrot \
    imagemagick \
    # Window manager (minimal)
    openbox \
    # Panel
    tint2 \
    # Desktop utilities
    xterm \
    # File manager
    pcmanfm \
    # Text editor (GUI)
    gedit \
    # Calculator
    galculator \
    # Image viewer
    gpicview \
    # PDF viewer
    evince \
    # Fonts
    fonts-dejavu \
    fonts-liberation \
    fonts-noto \
    fonts-noto-color-emoji \
    # D-Bus (required for some desktop apps)
    dbus-x11 \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Firefox ESR (from Mozilla PPA for latest version)
# =============================================================================
RUN add-apt-repository ppa:mozillateam/ppa -y && \
    echo 'Package: *\nPin: release o=LP-PPA-mozillateam\nPin-Priority: 1001' | tee /etc/apt/preferences.d/mozilla-firefox && \
    apt-get update && \
    apt-get install -y firefox-esr && \
    rm -rf /var/lib/apt/lists/*

# =============================================================================
# noVNC (web-based VNC client)
# =============================================================================
RUN git clone --branch v1.5.0 --depth 1 https://github.com/novnc/noVNC.git /opt/noVNC && \
    git clone --branch v0.12.0 --depth 1 https://github.com/novnc/websockify /opt/noVNC/utils/websockify && \
    ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html

# Generate locales
RUN locale-gen en_US.UTF-8
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
# Node.js 22 LTS
# =============================================================================
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm

# =============================================================================
# Python 3.12 (using deadsnakes PPA)
# =============================================================================
RUN add-apt-repository ppa:deadsnakes/ppa -y && \
    apt-get update && \
    apt-get install -y python3.12 python3.12-venv python3.12-dev python3-pip && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1 && \
    update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1 && \
    rm -rf /var/lib/apt/lists/*

# =============================================================================
# Go (latest stable)
# =============================================================================
ENV GO_VERSION=1.22.4
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" | tar -C /usr/local -xzf -
ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="${HOME}/go"
ENV PATH="${GOPATH}/bin:${PATH}"

# =============================================================================
# Rust (via rustup)
# =============================================================================
USER $USERNAME
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="${HOME}/.cargo/bin:${PATH}"
USER root

# =============================================================================
# Modern CLI tools
# =============================================================================
# ripgrep
RUN curl -LO https://github.com/BurntSushi/ripgrep/releases/download/14.1.0/ripgrep_14.1.0-1_amd64.deb && \
    dpkg -i ripgrep_14.1.0-1_amd64.deb && \
    rm ripgrep_14.1.0-1_amd64.deb

# fd
RUN curl -LO https://github.com/sharkdp/fd/releases/download/v10.1.0/fd_10.1.0_amd64.deb && \
    dpkg -i fd_10.1.0_amd64.deb && \
    rm fd_10.1.0_amd64.deb

# bat
RUN curl -LO https://github.com/sharkdp/bat/releases/download/v0.24.0/bat_0.24.0_amd64.deb && \
    dpkg -i bat_0.24.0_amd64.deb && \
    rm bat_0.24.0_amd64.deb

# fzf
RUN git clone --depth 1 https://github.com/junegunn/fzf.git /opt/fzf && \
    /opt/fzf/install --bin && \
    ln -s /opt/fzf/bin/fzf /usr/local/bin/fzf

# yq
RUN curl -LO https://github.com/mikefarah/yq/releases/download/v4.44.1/yq_linux_amd64 && \
    chmod +x yq_linux_amd64 && \
    mv yq_linux_amd64 /usr/local/bin/yq

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

# httpie
RUN pip install httpie --break-system-packages

# =============================================================================
# OpenCode
# =============================================================================
RUN npm install -g opencode-ai

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
    echo '[Desktop Entry]\nType=Application\nName=Firefox\nExec=firefox-esr\nIcon=firefox' > $HOME/.local/share/applications/firefox.desktop && \
    echo '[Desktop Entry]\nType=Application\nName=Text Editor\nExec=gedit\nIcon=text-editor' > $HOME/.local/share/applications/editor.desktop

# Set up shell configuration
RUN echo 'export PATH="$HOME/.cargo/bin:$HOME/go/bin:/usr/local/go/bin:$PATH"' >> $HOME/.bashrc && \
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
# OpenCode API
EXPOSE 4096
# noVNC (web-based desktop access)
EXPOSE 6080
# VNC (direct VNC access, optional)
EXPOSE 5901

# =============================================================================
# Health check
# =============================================================================
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -sf http://localhost:${OPENCODE_PORT}/app || exit 1

USER $USERNAME
WORKDIR $WORKSPACE

ENTRYPOINT ["/entrypoint.sh"]
