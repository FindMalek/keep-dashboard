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


def attribute(out, name):
    """Row of `smartctl -A` for one attribute name: (normalized value, raw value), or None."""
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 10 and parts[1] == name and parts[0].isdigit():
            raw = re.match(r"\d+", parts[9])
            return (int(parts[3]), int(raw.group()) if raw else None)
    return None


def labelled(out, key):
    """NVMe style `Key:   value` lines."""
    for line in out.splitlines():
        if line.startswith(key):
            match = re.search(r"(\d+)", line.split(":", 1)[1])
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
    wear = labelled(out, "Percentage Used")
    if wear is None:
        # SATA: the normalized value counts down from 100, so wear is what is gone.
        for name in ("Wear_Leveling_Count", "Media_Wearout_Indicator", "SSD_Life_Left", "Percent_Lifetime_Remain"):
            found = attribute(out, name)
            if found:
                wear = 100 - found[0]
                break
    temperature = labelled(out, "Temperature:")
    for name in ("Temperature_Celsius", "Airflow_Temperature_Cel"):
        found = attribute(out, name)
        if temperature is None and found:
            temperature = found[1]
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
