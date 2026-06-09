# Focus Lock Handoff

This project is a personal Chrome extension plus macOS native helper for timed focus sessions.

Project root:

`/Users/sashikantkumar/Desktop/Projects/focus-lock`

The user wants all future projects built inside:

`/Users/sashikantkumar/Desktop/Projects`

## Product Intent

Focus Lock lets the user enter a duration, then blocks Instagram and X/Twitter for that duration. During an active lock there must be no in-extension stop, pause, or unlock button. The lock is "hard but honest": it should survive refreshes and Chrome restarts, but it cannot and must not claim to prevent Chrome-level extension disabling/removal.

The popup includes a blocked-sites panel. Instagram, X, and Twitter are built-in defaults and must remain present. The user can add/remove extra custom domains before starting a lock.

The extension optionally asks a local macOS native messaging helper to toggle Apple Focus. If the user enables Apple Focus "Share Across Devices", this can also silence iPhone notifications. A Chrome extension cannot directly control macOS or iPhone notifications; the native helper and Apple Shortcuts are the bridge.

## Architecture

### Chrome Extension

Location:

`extension/`

Important files:

- `manifest.json`: Manifest V3 extension definition.
- `background.js`: Background service worker. Owns timer state, block rules, alarms, and native host calls.
- `popup.html`, `popup.js`, `popup.css`: Extension popup UI.
- `self-test.html`, `self-test.js`: In-extension self-test page for manual validation after loading the extension in Chrome.

Core APIs:

- `chrome.storage.local`: Stores `focusLockState`.
- `chrome.storage.local`: Stores custom domains under `focusLockCustomSites`.
- `chrome.alarms`: Schedules automatic release at `lockUntil`.
- `chrome.declarativeNetRequest`: Installs/removes dynamic blocking rules.
- `chrome.runtime.sendNativeMessage`: Calls the macOS native helper.

Runtime messages handled by `background.js`:

- `GET_STATE`: returns active/inactive state and remaining time.
- `START_LOCK`: validates minutes, stores lock, installs DNR rules, schedules release, calls native helper.
- `VALIDATE_RULES`: checks rule regex support through `chrome.declarativeNetRequest.isRegexSupported`.
- `GET_SITES`: returns built-in and custom blocked-site lists.
- `ADD_SITE`: normalizes and stores a custom domain while inactive.
- `REMOVE_SITE`: removes a custom domain while inactive.

Blocked domains:

- `instagram.com`
- subdomains of `instagram.com`
- `x.com`
- subdomains of `x.com`
- `twitter.com`
- subdomains of `twitter.com`

Custom domains are normalized to root-ish hostnames such as `youtube.com`, and the generated DNR regex blocks the domain plus subdomains.

### Native Host

Location:

`native-host/focus_lock_host.py`

Chrome native messaging host name:

`com.focus_lock.host`

Native messages:

- `{ "action": "start", "minutes": <number>, "lockUntil": <timestamp> }`
- `{ "action": "stop" }`

The helper reads/writes native messaging frames on stdio. It runs macOS Shortcuts via:

- `shortcuts run "Focus Lock Start"`
- `shortcuts run "Focus Lock Stop"`

Required user-created Shortcuts:

- `Focus Lock Start`: turns the chosen Apple Focus mode on, for example `Deep Focus`.
- `Focus Lock Stop`: turns the same Apple Focus mode off.

Native host registration script:

`scripts/install-native-host.sh <chrome-extension-id>`

It writes:

`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.focus_lock.host.json`

## Invariants

- Do not add a stop, pause, snooze, or override button to the locked popup state.
- Do not represent the extension as impossible to bypass. Chrome users can disable/remove normal extensions.
- Keep the extension standalone. Do not merge it into the existing `ambi` project unless the user explicitly asks.
- Keep the first-party lock state in `chrome.storage.local` as an absolute timestamp, not just a countdown. This keeps restarts sane.
- Keep blocking implemented with `declarativeNetRequest`, not page-only content scripts.
- Keep Instagram, X, and Twitter as non-removable built-in sites.
- Custom blocked sites may be edited only while no timer is active.
- Timer expiry must remove dynamic DNR rules and call the native helper with `action: "stop"`.
- Native helper failures must not prevent website blocking. The popup should show that Apple Focus failed, but the lock should still start.
- Native helper must never run arbitrary commands from extension input. It only accepts known `start` and `stop` actions.
- Keep Apple Focus control as an optional local bridge. Chrome extension code must not pretend to directly silence Mac/iPhone notifications.
- Default max timer is currently 1440 minutes in the popup and background. Keep UI and background validation aligned.
- Prefer no build step for the extension itself. It should remain loadable as an unpacked extension from `extension/`.

## Constraints And Known Traps

- Branded Google Chrome on this machine ignores old command-line unpacked extension flags such as `--disable-extensions-except`. Chrome logged: `--disable-extensions-except is not allowed in Google Chrome, ignoring.`
- Automated extension E2E uses Playwright's Chrome for Testing, not the user's normal Google Chrome.
- A service worker cannot message itself via `chrome.runtime.sendMessage` the same way an extension page can. E2E tests should drive an extension page such as `self-test.html`.
- Native messaging requires the actual extension ID. The ID is only known after loading the unpacked extension in `chrome://extensions`.
- The helper can be tested before Shortcuts exist, but `start`/`stop` will return a graceful failure until `Focus Lock Start` and `Focus Lock Stop` are created.
- Running Python syntax checks creates `__pycache__`; remove it before final handoff or keep it ignored.

## Test Commands

Install dependencies once:

```sh
npm install
npx playwright install chromium
```

Run all repeatable validation:

```sh
./scripts/validate.sh
```

Useful individual tests:

```sh
node scripts/test-extension-background.js
npm run test:e2e
./scripts/test-native-host.py noop
./scripts/test-native-host.py start
./scripts/test-native-host.py stop
```

Expected current behavior:

- `./scripts/validate.sh` should pass.
- `npm run test:e2e` should pass using Chrome for Testing. It covers adding a custom site and blocking it during the lock.
- `./scripts/test-native-host.py noop` should return a clean unknown-action error.
- `./scripts/test-native-host.py start` and `stop` may return Shortcut errors until the macOS Shortcuts exist.

## Manual User Setup

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load unpacked:

   `/Users/sashikantkumar/Desktop/Projects/focus-lock/extension`

4. Copy the extension ID.
5. Register the native host:

   ```sh
   ./scripts/install-native-host.sh <extension-id>
   ```

6. Create macOS Shortcuts:

   - `Focus Lock Start`
   - `Focus Lock Stop`

7. Enable Apple Focus "Share Across Devices" if iPhone notification silencing is desired.

8. Optional in-Chrome validation:

   `chrome-extension://<extension-id>/self-test.html`

## Current Validation Status

Last known full validation passed with:

```sh
./scripts/validate.sh
```

It verified manifest parsing, syntax checks, mocked background behavior, real Chrome-for-Testing E2E lock behavior including a custom domain, and native host protocol.
