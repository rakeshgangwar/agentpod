# =============================================================================
# CodeOpen Cloud Add-on
# Adds cloud provider CLIs and infrastructure tools
# =============================================================================
# Size: ~600MB (on top of flavor image)
# Includes: AWS CLI, GCP SDK, Azure CLI, Terraform, kubectl
# =============================================================================

ARG BASE_IMAGE=codeopen-fullstack:latest
FROM ${BASE_IMAGE}

LABEL maintainer="CodeOpen Team"
LABEL description="Cloud add-on with provider CLIs and infrastructure tools"
LABEL addon="cloud"

USER root

# =============================================================================
# AWS CLI v2
# =============================================================================
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "arm64" ]; then AWS_ARCH="aarch64"; else AWS_ARCH="x86_64"; fi && \
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${AWS_ARCH}.zip" -o "awscliv2.zip" && \
    unzip -q awscliv2.zip && \
    ./aws/install && \
    rm -rf aws awscliv2.zip

# =============================================================================
# Google Cloud SDK
# =============================================================================
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | \
    tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && \
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | \
    gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg && \
    apt-get update && apt-get install -y --no-install-recommends \
    google-cloud-cli \
    google-cloud-cli-gke-gcloud-auth-plugin \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Azure CLI
# =============================================================================
RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash && \
    rm -rf /var/lib/apt/lists/*

# =============================================================================
# Terraform
# =============================================================================
RUN ARCH=$(dpkg --print-architecture) && \
    wget -qO- https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
    tee /etc/apt/sources.list.d/hashicorp.list && \
    apt-get update && apt-get install -y --no-install-recommends \
    terraform \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Kubernetes Tools
# =============================================================================
RUN ARCH=$(dpkg --print-architecture) && \
    # kubectl
    curl -fsSL "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/${ARCH}/kubectl" -o /usr/local/bin/kubectl && \
    chmod +x /usr/local/bin/kubectl && \
    # helm
    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash && \
    # k9s
    curl -sL https://github.com/derailed/k9s/releases/latest/download/k9s_Linux_${ARCH}.tar.gz | tar xz -C /usr/local/bin k9s

# =============================================================================
# Infrastructure as Code Tools
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    ansible \
    && rm -rf /var/lib/apt/lists/*

# Install Pulumi (download and extract directly)
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "arm64" ]; then PULUMI_ARCH="linux-arm64"; else PULUMI_ARCH="linux-x64"; fi && \
    PULUMI_VERSION=$(curl -fsSL https://www.pulumi.com/latest-version) && \
    curl -fsSL "https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION}/pulumi-v${PULUMI_VERSION}-${PULUMI_ARCH}.tar.gz" | \
    tar -xz -C /usr/local/bin --strip-components=1

# =============================================================================
# Container Tools
# =============================================================================
RUN ARCH=$(dpkg --print-architecture) && \
    # Dive (Docker image analyzer) - fetch latest version
    DIVE_VERSION=$(curl -sL "https://api.github.com/repos/wagoodman/dive/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/') && \
    curl -sL "https://github.com/wagoodman/dive/releases/download/v${DIVE_VERSION}/dive_${DIVE_VERSION}_linux_${ARCH}.tar.gz" | \
    tar xz -C /usr/local/bin dive && \
    # Trivy (vulnerability scanner)
    curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# =============================================================================
# Create config directories
# =============================================================================
USER developer

RUN mkdir -p /home/developer/.aws && \
    mkdir -p /home/developer/.config/gcloud && \
    mkdir -p /home/developer/.azure && \
    mkdir -p /home/developer/.kube && \
    mkdir -p /home/developer/.terraform.d

# =============================================================================
# Environment variables
# =============================================================================
ENV AWS_CONFIG_FILE=/home/developer/.aws/config
ENV AWS_SHARED_CREDENTIALS_FILE=/home/developer/.aws/credentials
ENV KUBECONFIG=/home/developer/.kube/config
ENV CLOUDSDK_PYTHON=python3

# =============================================================================
# Add-on metadata
# =============================================================================
ENV CODEOPEN_ADDON_CLOUD="true"

WORKDIR /home/developer/workspace
