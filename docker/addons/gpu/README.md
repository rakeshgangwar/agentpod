# CodeOpen GPU Add-on

NVIDIA GPU support for machine learning and AI workloads.

## Features

- CUDA 12.4 Toolkit
- cuDNN library
- PyTorch with CUDA support
- TensorFlow with GPU support
- JAX with CUDA support
- GPU monitoring tools (nvtop, nvidia-smi)

## Requirements

### Host System
- NVIDIA GPU (Compute Capability 5.0+)
- NVIDIA Driver 525.60.13 or newer
- nvidia-docker2 runtime installed

### Docker Configuration

Install nvidia-docker2:
```bash
# Ubuntu/Debian
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NVIDIA_VISIBLE_DEVICES` | all | GPUs to expose (all, none, 0,1,2, uuid) |
| `NVIDIA_DRIVER_CAPABILITIES` | compute,utility | Driver capabilities |
| `CUDA_HOME` | /usr/local/cuda-12.4 | CUDA installation path |

## Usage

### Running with GPU

```bash
docker run --gpus all -it codeopen-fullstack-gpu:latest

# Specific GPUs
docker run --gpus '"device=0,1"' -it codeopen-fullstack-gpu:latest
```

### Verify GPU Access

```bash
# Check NVIDIA driver
nvidia-smi

# Check CUDA
nvcc --version

# Check PyTorch
python -c "import torch; print(torch.cuda.is_available())"

# Check TensorFlow
python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"
```

### GPU Monitoring

```bash
# Real-time monitoring
nvtop

# Basic info
nvidia-smi
```

## Pre-installed Libraries

| Library | Version | Description |
|---------|---------|-------------|
| PyTorch | Latest | Deep learning framework |
| TensorFlow | Latest | ML framework |
| JAX | Latest | High-performance numerical computing |
| CuPy | Latest | NumPy-compatible GPU array library |

## Image Size

Adds approximately 500MB to the flavor image size (plus NVIDIA base image overhead).

## Building

```bash
./docker/scripts/build-addon.sh gpu --base codeopen-python:latest
```

## Notes

- GPU add-on is only useful with flavors that include Python (python, fullstack, polyglot)
- Not all libraries may install successfully due to version compatibility
- For production ML workloads, consider using official NVIDIA base images
- GPU memory is shared between all containers using the GPU
