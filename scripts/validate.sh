#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8')); console.log('manifest ok')"
node --check extension/background.js
node --check extension/popup.js
node --check extension/self-test.js
node --check scripts/test-extension-background.js
node --check scripts/test-extension-e2e.js
node scripts/test-extension-background.js
npm run test:e2e
bash -n scripts/install-native-host.sh
python3 -m py_compile native-host/focus_lock_host.py scripts/test-native-host.py scripts/test-chrome-load.py
./scripts/test-native-host.py noop
