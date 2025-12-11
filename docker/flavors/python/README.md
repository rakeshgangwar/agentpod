# CodeOpen Python Flavor

Python development environment with ML/AI support.

## Languages

- Python 3.12

## Included Tools

### Package Managers
- pip
- uv (fast pip replacement)
- poetry

### Linting & Formatting
- ruff
- black
- isort
- mypy

### Testing
- pytest
- pytest-cov

### Interactive
- ipython
- jupyterlab
- notebook

### HTTP
- httpie

## Frameworks Supported

- Django
- Flask
- FastAPI
- Starlette
- PyTorch
- TensorFlow
- LangChain
- Transformers

## Usage

```bash
docker run -it codeopen-python:latest
```

### Creating a Virtual Environment

```bash
# Using uv (recommended, fast)
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt

# Using poetry
poetry install

# Using venv
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Running Jupyter

```bash
jupyter lab --ip=0.0.0.0 --port=8888 --no-browser
```

## Building

```bash
./docker/scripts/build-flavor.sh python
```

## GPU Support

For GPU/CUDA support, use the GPU add-on:

```bash
./docker/scripts/build-addon.sh python gpu
```
