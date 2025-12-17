# =============================================================================
# AgentPod Go Flavor
# Go development environment
# =============================================================================
# Size: ~900MB (on top of base)
# Languages: Go
# =============================================================================

ARG BASE_IMAGE=codeopen-base:latest
FROM ${BASE_IMAGE}

LABEL maintainer="AgentPod Team"
LABEL description="Go development environment"
LABEL flavor="go"

USER root

# =============================================================================
# Go Installation
# =============================================================================
ENV GO_VERSION=1.22.4
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-$(dpkg --print-architecture).tar.gz" | tar -C /usr/local -xzf -

# Set up Go environment
ENV GOROOT=/usr/local/go
ENV GOPATH=/home/go
ENV PATH="${GOROOT}/bin:${GOPATH}/bin:${PATH}"

# =============================================================================
# Go Tools
# =============================================================================
USER developer

# Create Go directories
RUN mkdir -p /home/go/{bin,src,pkg}

# Install common Go tools
RUN go install golang.org/x/tools/gopls@latest && \
    go install github.com/go-delve/delve/cmd/dlv@latest && \
    go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest && \
    go install github.com/air-verse/air@latest && \
    go install github.com/swaggo/swag/cmd/swag@latest && \
    go install github.com/golang/mock/mockgen@latest && \
    go install gotest.tools/gotestsum@latest

# =============================================================================
# Update shell configuration
# =============================================================================
RUN echo 'export GOROOT=/usr/local/go' >> /home/developer/.bashrc && \
    echo 'export GOPATH=/home/go' >> /home/developer/.bashrc && \
    echo 'export PATH="${GOROOT}/bin:${GOPATH}/bin:${PATH}"' >> /home/developer/.bashrc

# =============================================================================
# Flavor metadata
# =============================================================================
ENV CODEOPEN_FLAVOR="go"
ENV CODEOPEN_LANGUAGES="go"

WORKDIR /home/workspace
