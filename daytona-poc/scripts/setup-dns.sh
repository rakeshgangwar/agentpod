#!/bin/bash
# Setup DNS for Daytona proxy URLs
#
# Daytona uses *.proxy.localhost for sandbox preview URLs.
# This script configures your system to resolve these domains to localhost.

set -e

echo "=== Daytona DNS Setup ==="
echo ""
echo "Daytona uses *.proxy.localhost domains for sandbox preview URLs."
echo "We need to configure DNS to resolve these to 127.0.0.1"
echo ""

# Check if running on Linux or macOS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Detected: Linux"
    echo ""
    
    # Option 1: /etc/hosts (simplest, but doesn't support wildcards)
    echo "Option 1: Add to /etc/hosts (limited - no wildcard support)"
    echo "  echo '127.0.0.1 proxy.localhost' | sudo tee -a /etc/hosts"
    echo ""
    
    # Option 2: Use dnsmasq
    echo "Option 2: Use dnsmasq (recommended - supports wildcards)"
    echo ""
    
    if command -v dnsmasq &> /dev/null; then
        echo "dnsmasq is installed."
        echo ""
        echo "Add this to /etc/dnsmasq.conf or /etc/dnsmasq.d/daytona.conf:"
        echo "  address=/proxy.localhost/127.0.0.1"
        echo ""
        echo "Then restart dnsmasq:"
        echo "  sudo systemctl restart dnsmasq"
    else
        echo "dnsmasq is not installed. Install with:"
        echo "  sudo apt install dnsmasq  # Debian/Ubuntu"
        echo "  sudo dnf install dnsmasq  # Fedora"
        echo ""
        echo "Then add to /etc/dnsmasq.d/daytona.conf:"
        echo "  address=/proxy.localhost/127.0.0.1"
    fi
    echo ""
    
    # Option 3: Use systemd-resolved
    echo "Option 3: Use systemd-resolved (if available)"
    if command -v resolvectl &> /dev/null; then
        echo "systemd-resolved is available."
        echo "You can add a drop-in configuration or use resolvectl."
    fi
    
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Detected: macOS"
    echo ""
    
    # On macOS, .localhost domains should resolve to 127.0.0.1 by default
    echo "On macOS, .localhost domains typically resolve to 127.0.0.1 automatically."
    echo ""
    echo "Testing DNS resolution..."
    if host proxy.localhost &> /dev/null; then
        echo "  proxy.localhost resolves correctly!"
    else
        echo "  proxy.localhost does not resolve."
        echo ""
        echo "You may need to install dnsmasq via Homebrew:"
        echo "  brew install dnsmasq"
        echo ""
        echo "Then configure it:"
        echo "  echo 'address=/proxy.localhost/127.0.0.1' >> /usr/local/etc/dnsmasq.conf"
        echo "  sudo brew services restart dnsmasq"
    fi
else
    echo "Detected: Unknown OS ($OSTYPE)"
    echo "Please manually configure DNS to resolve *.proxy.localhost to 127.0.0.1"
fi

echo ""
echo "=== Alternative: Use nip.io ==="
echo ""
echo "If DNS configuration is too complex, you can use nip.io domains instead."
echo "Example: sandbox-id.127.0.0.1.nip.io will resolve to 127.0.0.1"
echo ""
echo "This requires configuring Daytona to use nip.io domains (not covered here)."
