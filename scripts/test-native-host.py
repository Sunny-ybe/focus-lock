#!/usr/bin/env python3
import json
import struct
import subprocess
import sys


def frame(message):
    encoded = json.dumps(message).encode("utf-8")
    return struct.pack("@I", len(encoded)) + encoded


def read_response(stdout):
    raw_length = stdout.read(4)
    if len(raw_length) != 4:
        raise RuntimeError("No response from native host.")
    length = struct.unpack("@I", raw_length)[0]
    payload = stdout.read(length)
    return json.loads(payload.decode("utf-8"))


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "start"
    host = "./native-host/focus_lock_host.py"
    process = subprocess.Popen(
        [host],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    process.stdin.write(frame({"action": action}))
    process.stdin.close()
    response = read_response(process.stdout)
    print(json.dumps(response, indent=2))
    process.wait(timeout=5)


if __name__ == "__main__":
    main()
