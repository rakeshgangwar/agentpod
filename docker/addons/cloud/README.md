# CodeOpen Cloud Add-on

Cloud provider CLIs and infrastructure tools.

## Features

### Cloud Provider CLIs
- **AWS CLI v2**: Amazon Web Services
- **Google Cloud SDK**: Google Cloud Platform
- **Azure CLI**: Microsoft Azure

### Infrastructure as Code
- **Terraform**: HashiCorp IaC
- **Pulumi**: Multi-language IaC
- **Ansible**: Configuration management

### Kubernetes Tools
- **kubectl**: Kubernetes CLI
- **Helm**: Kubernetes package manager
- **k9s**: Terminal UI for Kubernetes

### Container Tools
- **Dive**: Docker image layer analyzer
- **Trivy**: Vulnerability scanner

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AWS_CONFIG_FILE` | AWS configuration file |
| `AWS_SHARED_CREDENTIALS_FILE` | AWS credentials file |
| `AWS_PROFILE` | AWS profile to use |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP service account key file |
| `AZURE_CONFIG_DIR` | Azure configuration directory |
| `KUBECONFIG` | Kubernetes configuration file |

## Usage

### AWS

```bash
# Configure credentials
aws configure

# Or use environment variables
export AWS_ACCESS_KEY_ID=xxx
export AWS_SECRET_ACCESS_KEY=xxx
export AWS_DEFAULT_REGION=us-east-1

# Verify
aws sts get-caller-identity
```

### Google Cloud

```bash
# Login interactively
gcloud auth login

# Or use service account
gcloud auth activate-service-account --key-file=key.json

# Set project
gcloud config set project my-project

# Verify
gcloud info
```

### Azure

```bash
# Login interactively
az login

# Or use service principal
az login --service-principal -u APP_ID -p PASSWORD --tenant TENANT_ID

# Verify
az account show
```

### Kubernetes

```bash
# Configure kubectl (AWS EKS)
aws eks update-kubeconfig --name my-cluster --region us-east-1

# Configure kubectl (GKE)
gcloud container clusters get-credentials my-cluster --zone us-central1-a

# Configure kubectl (AKS)
az aks get-credentials --resource-group my-rg --name my-cluster

# Use k9s for interactive management
k9s
```

### Terraform

```bash
terraform init
terraform plan
terraform apply
```

### Pulumi

```bash
pulumi login
pulumi new aws-typescript
pulumi up
```

## Credential Management

For security, pass credentials as environment variables or mount them as volumes:

```bash
docker run \
  -v ~/.aws:/home/developer/.aws:ro \
  -v ~/.kube:/home/developer/.kube:ro \
  ...
```

## Image Size

Adds approximately 600MB to the flavor image size.

## Building

```bash
./docker/scripts/build-addon.sh cloud --base codeopen-fullstack:latest
```

## Notes

- Cloud CLIs are configured for development use
- Do NOT store credentials in the container image
- Use IAM roles, service accounts, or managed identities in production
- The cloud add-on is useful for DevOps and infrastructure work
