# =============================================================================
# CodeOpen GPU Add-on
# Adds NVIDIA GPU support for ML/AI workloads
# =============================================================================
# Size: ~500MB (on top of flavor image, plus NVIDIA base image overhead)
# Requirements: NVIDIA GPU, nvidia-docker2 runtime
# CUDA: 12.6 (latest stable for Ubuntu 24.04)
# cuDNN: Included
# =============================================================================

ARG BASE_IMAGE=codeopen-fullstack:latest
FROM ${BASE_IMAGE}

LABEL maintainer="CodeOpen Team"
LABEL description="GPU add-on with NVIDIA CUDA support"
LABEL addon="gpu"

USER root

# =============================================================================
# NVIDIA CUDA Toolkit
# =============================================================================
# Install CUDA keyring and repository for Ubuntu 24.04
RUN wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb && \
    dpkg -i cuda-keyring_1.1-1_all.deb && \
    rm cuda-keyring_1.1-1_all.deb && \
    apt-get update

# Install CUDA toolkit (runtime + compiler, using meta-packages)
# Using cuda-toolkit-12-6 which is the latest available for Ubuntu 24.04
RUN apt-get install -y --no-install-recommends \
    cuda-toolkit-12-6 \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install cuDNN 9 (for CUDA 12.x on Ubuntu 24.04)
RUN apt-get update && apt-get install -y --no-install-recommends \
    cudnn9-cuda-12 \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# =============================================================================
# CUDA Environment
# =============================================================================
ENV CUDA_HOME=/usr/local/cuda
ENV PATH="${CUDA_HOME}/bin:${PATH}"
ENV LD_LIBRARY_PATH="${CUDA_HOME}/lib64${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"

# =============================================================================
# Python ML Libraries (GPU versions)
# =============================================================================
USER developer

# Install PyTorch with CUDA support (CUDA 12.4 wheel works with 12.6)
RUN pip install --user --break-system-packages \
    torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 || true

# Install other ML libraries (optional, may fail on some systems)
RUN pip install --user --break-system-packages \
    numpy \
    scipy \
    && pip install --user --break-system-packages \
    tensorflow[and-cuda] \
    2>/dev/null || echo "TensorFlow installation skipped or failed"

# =============================================================================
# GPU utilities
# =============================================================================
USER root

# Install nvidia-smi wrapper and monitoring tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    nvtop \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Environment variables
# =============================================================================
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

# =============================================================================
# Add-on metadata
# =============================================================================
ENV CODEOPEN_ADDON_GPU="true"
ENV CODEOPEN_CUDA_VERSION="12.6"

USER developer
WORKDIR /home/developer/workspace
