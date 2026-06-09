# Focus Lock

A personal Chrome focus timer that blocks Instagram and X/Twitter, with an optional macOS native helper that toggles Apple Focus so notifications are silenced on your Mac and iPhone.

## What it can and cannot do

Focus Lock can block the chosen sites inside Chrome until the timer ends. Instagram and X/Twitter are always included, and you can add more sites from the popup before starting a lock. The extension has no stop button while locked, and the lock survives Chrome restarts.

Chrome still lets you disable or remove your own extensions. A normal personal extension cannot prevent uninstalling itself.

## Apple Focus setup

Create two shortcuts in the macOS Shortcuts app:

1. `Focus Lock Start`
   - Add the Set Focus action.
   - Set your Focus mode, for example `Deep Focus`, to On.

2. `Focus Lock Stop`
   - Add the Set Focus action.
   - Set the same Focus mode to Off.

On your Apple devices, enable Share Across Devices for Focus so your iPhone follows the Mac Focus state.

## Chrome setup

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select:

   `/Users/sashikantkumar/Desktop/Projects/focus-lock/extension`

5. Copy the loaded extension ID.
6. Install the native messaging host:

   ```sh
   /Users/sashikantkumar/Desktop/Projects/focus-lock/scripts/install-native-host.sh <extension-id>
   ```

## Local helper test

From the project folder:

```sh
./scripts/validate.sh
node scripts/test-extension-background.js
npm run test:e2e
./scripts/test-native-host.py start
./scripts/test-native-host.py stop
```

The native-host commands will run the matching Apple Shortcuts if they exist. The E2E test uses Playwright's Chrome for Testing build because current branded Google Chrome no longer accepts the old command-line unpacked extension flags.

## In-Chrome self-test

After loading the extension through `chrome://extensions`, open its extension ID URL:

```text
chrome-extension://<extension-id>/self-test.html
```

Click Run. This checks the real background worker, validates the blocking regex rules through Chrome's DNR API, starts a one-minute lock, and verifies the stored lock can be read.

The included `scripts/test-extension-e2e.js` loads the extension in Chrome for Testing, adds a custom blocked site, starts a one-minute lock, verifies the popup and self-test page, confirms Instagram and the custom site are blocked, and confirms a neutral page still loads.
