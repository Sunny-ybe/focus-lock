#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <chrome-extension-id>" >&2
  echo "Load the extension in Chrome first, then copy its ID from chrome://extensions." >&2
  exit 1
fi

EXTENSION_ID="$1"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_SCRIPT="$PROJECT_DIR/native-host/focus_lock_host.py"
HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_MANIFEST="$HOST_DIR/com.focus_lock.host.json"

chmod +x "$HOST_SCRIPT"
mkdir -p "$HOST_DIR"

cat > "$HOST_MANIFEST" <<JSON
{
  "name": "com.focus_lock.host",
  "description": "Focus Lock macOS notification bridge",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
JSON

echo "Installed native messaging host:"
echo "$HOST_MANIFEST"
