#!/usr/bin/env python3
import subprocess
import sys

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
EXTENSION = "/Users/sashikantkumar/Desktop/Projects/focus-lock/extension"
PROFILE = "/private/tmp/focus-lock-chrome-profile"


def main():
    command = [
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        f"--user-data-dir={PROFILE}",
        f"--disable-extensions-except={EXTENSION}",
        f"--load-extension={EXTENSION}",
        "--dump-dom",
        "about:blank",
    ]

    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        stdout, stderr = process.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        stdout, stderr = process.communicate()
        print("chrome load smoke test reached timeout after startup")

    if stdout.strip():
        print(stdout.strip())
    if stderr.strip():
        print(stderr.strip(), file=sys.stderr)

    if "<html" not in stdout:
        raise SystemExit("Chrome did not dump a page DOM.")

    print("chrome extension load smoke test ok")


if __name__ == "__main__":
    main()
