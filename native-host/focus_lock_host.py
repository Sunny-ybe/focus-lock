#!/usr/bin/env python3
import json
import shutil
import struct
import subprocess
import sys

START_SHORTCUT = "Focus Lock Start"
STOP_SHORTCUT = "Focus Lock Stop"


def main():
    while True:
        message = read_message()
        if message is None:
            return

        try:
            response = handle_message(message)
        except Exception as exc:
            response = {"ok": False, "error": str(exc)}

        write_message(response)


def handle_message(message):
    action = message.get("action")

    if action == "start":
        return run_shortcut(START_SHORTCUT)

    if action == "stop":
        return run_shortcut(STOP_SHORTCUT)

    return {"ok": False, "error": f"Unknown action: {action}"}


def run_shortcut(name):
    shortcuts = shutil.which("shortcuts")
    if not shortcuts:
        return {"ok": False, "error": "The macOS shortcuts command was not found."}

    result = subprocess.run(
        [shortcuts, "run", name],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )

    if result.returncode != 0:
        return {
            "ok": False,
            "shortcut": name,
            "error": (result.stderr or result.stdout or "Shortcut failed.").strip(),
        }

    return {"ok": True, "shortcut": name}


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    if len(raw_length) != 4:
        raise RuntimeError("Invalid native messaging frame length.")

    message_length = struct.unpack("@I", raw_length)[0]
    message = sys.stdin.buffer.read(message_length)
    if len(message) != message_length:
        raise RuntimeError("Incomplete native messaging payload.")

    return json.loads(message.decode("utf-8"))


def write_message(message):
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("@I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
