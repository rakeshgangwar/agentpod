# Contributing

## Git Setup

This repository is mirrored to both GitHub and Forgejo. A single `git push` updates both.

### Remote Configuration

```
origin	https://github.com/rakeshgangwar/CodeOpen.git (fetch)
origin	https://github.com/rakeshgangwar/CodeOpen.git (push)
origin	https://forgejo.superchotu.com/rakeshgangwar/CodeOpen.git (push)
```

### Commands

| Command | Action |
|---------|--------|
| `git push` | Pushes to **both** GitHub and Forgejo |
| `git pull` | Pulls from GitHub (primary) |

### Setting Up Dual Push (New Clone)

If you clone this repo fresh and want to push to both remotes:

```bash
# Add Forgejo as additional push URL
git remote set-url --add --push origin https://forgejo.superchotu.com/rakeshgangwar/CodeOpen.git

# Verify
git remote -v
```

### Forgejo Credentials

For Forgejo HTTPS authentication, use git credential store:

```bash
# Enable credential store
git config --global credential.helper store

# Add credentials (replace YOUR_TOKEN with Forgejo API token)
echo "https://USERNAME:YOUR_TOKEN@forgejo.superchotu.com" >> ~/.git-credentials
```

### Repository URLs

| Platform | URL |
|----------|-----|
| GitHub | https://github.com/rakeshgangwar/CodeOpen |
| Forgejo | https://forgejo.superchotu.com/rakeshgangwar/CodeOpen |
