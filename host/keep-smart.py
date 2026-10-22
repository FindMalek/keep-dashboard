#!/usr/bin/env python3
"""Weekly SMART health check for the box's SSDs.

Runs from keep-smart.service / keep-smart.timer. Writes a JSON summary that the
dashboard reads to show disk wear and status.
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

OUT = "/srv/keep-dashboard/smart.json"


def run(*args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"smartctl failed: {result.stderr.strip()}", file=sys.stderr)
    return result.stdout


def devices():
    """List ATA/SATA/NVMe devices from smartctl --scan."""
    out = run("smartctl", "--scan")
    for line in out.splitlines():
        parts = line.split()
        if not parts:
            continue
        path = parts[0]
        # Skip duplicates listed as /dev/sg*; keep block devices.
        if path.startswith("/dev/sg"):
            continue
        yield path


def parse_value(out, key):
    for line in out.splitlines():
        if line.strip().startswith(key):
            match = re.search(r"(\d+)", line)
            if match:
                return int(match.group(1))
    return None


def health(path):
    out = run("smartctl", "-H", path)
    if "PASSED" in out:
        return "passed"
    if "FAILED" in out:
        return "failed"
    return "unknown"


def info(path):
    out = run("smartctl", "-A", path)
    wear = parse_value(out, "Wear_Leveling_Count") or parse_value(out, "Media_Wearout_Indicator") or parse_value(out, "Percentage Used")
    temperature = parse_value(out, "Temperature_Celsius") or parse_value(out, "Temperature")
    return {"wearPercent": wear, "temperatureC": temperature}


def main():
    disks = []
    for path in devices():
        disks.append({
            "device": path,
            "health": health(path),
            **info(path),
        })

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(f"{OUT}.tmp", "w") as handle:
        json.dump({
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "disks": disks,
        }, handle)
    os.replace(f"{OUT}.tmp", OUT)
    print(json.dumps(disks, indent=2))


if __name__ == "__main__":
    main()
