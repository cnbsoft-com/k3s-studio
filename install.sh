#!/bin/bash
set -e

# mpk3s - Single line installation script
# This script downloads the mpk3s binary and installs it to /usr/local/bin

REPO="cnbsoft-com/mpk3s"
BINARY_URL="https://raw.githubusercontent.com/${REPO}/main/bin/mpk3s"
INSTALL_PATH="/usr/local/bin/mpk3s"

echo "🦖 Starting mpk3s installation..."

# 1. OS Check (macOS only as per current README)
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ Error: This script is currently optimized for macOS only."
    exit 1
fi

# 2. Check Prerequisites
if ! command -v multipass &> /dev/null; then
    echo "⚠️  Warning: 'multipass' is not installed. mpk3s requires Multipass to function."
    echo "🔗 Install it via: brew install --cask multipass"
fi

# 3. Download Binary
echo "📥 Downloading mpk3s from GitHub..."
curl -fsSL "$BINARY_URL" -o /tmp/mpk3s

# 4. Install to /usr/local/bin
echo "🚀 Installing to ${INSTALL_PATH} (requires sudo)..."
sudo mv /tmp/mpk3s "$INSTALL_PATH"
sudo chmod +x "$INSTALL_PATH"

echo "✅ Installation completed successfully!"
echo "👉 Try running: mpk3s usage"
