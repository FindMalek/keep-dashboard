#!/usr/bin/env python3
"""Discover active devices on the LAN and write them for the dashboard.

Runs every 5 minutes from keep-network-devices.timer. Uses /proc/net/arp plus
a ping sweep of 192.168.1.0/24. Storage is only shown for the-keep itself.
"""

import json
import os
import re
import subprocess
from datetime import datetime, timezone

OUT = "/srv/keep-dashboard/network-devices.json"
SUBNET = "192.168.1"
TIMEOUT_S = "1"
KEEP_LAN_IP = "192.168.1.81"


def run(*args, timeout=10):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def parse_arp():
    entries = {}
    try:
        with open("/proc/net/arp") as handle:
            for line in handle.read().splitlines()[1:]:
                parts = line.strip().split()
                if len(parts) < 4:
                    continue
                ip, _, _, mac, _, state = parts[:6]
                if not re.match(r"^([0-9a-f]{2}:){5}[0-9a-f]{2}$", mac, re.I):
                    continue
                entries[ip] = {"mac": mac, "state": state}
    except OSError:
        pass
    return entries


def ping(ip):
    result = run("ping", "-c", "1", "-W", TIMEOUT_S, ip, timeout=3)
    return result.returncode == 0


def hostname(ip):
    result = run("dig", "+short", "+time=1", "+tries=1", "-x", ip, timeout=3)
    if result.returncode != 0:
        return None
    name = result.stdout.strip().splitlines()[0] if result.stdout.strip() else None
    return name.replace(".", "") if name else None


def keep_storage():
    """Return the-keep's /srv usage in bytes."""
    try:
        result = run("df", "-B1", "/srv", timeout=5)
        parts = result.stdout.strip().splitlines()[1].split()
        return {"total": int(parts[1]), "used": int(parts[2])}
    except (OSError, ValueError, IndexError):
        return None


def discover():
    arp = parse_arp()
    online = set()

    # Ping sweep in batches.
    ips = [f"{SUBNET}.{i}" for i in range(1, 255)]
    batch = 25
    for i in range(0, len(ips), batch):
        processes = []
        for ip in ips[i : i + batch]:
            proc = subprocess.Popen(
                ["ping", "-c", "1", "-W", TIMEOUT_S, ip],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            processes.append((ip, proc))
        for ip, proc in processes:
            try:
                if proc.wait(3) == 0:
                    online.add(ip)
            except subprocess.TimeoutExpired:
                proc.kill()

    candidates = set(online) | set(arp.keys())
    devices = []
    storage = keep_storage()

    for ip in sorted(candidates, key=lambda x: [int(n) for n in x.split(".")]):
        entry = arp.get(ip, {})
        name = hostname(ip) or entry.get("mac") or ip
        is_online = ip in online or entry.get("state") == "REACHABLE"
        is_keep = ip == KEEP_LAN_IP
        devices.append(
            {
                "ip": ip,
                "mac": entry.get("mac"),
                "name": "the-keep" if is_keep else name,
                "online": is_online,
                "storage": storage if is_keep else None,
            }
        )

    return devices


def main():
    devices = discover()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(f"{OUT}.tmp", "w") as handle:
        json.dump(
            {
                "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "devices": devices,
            },
            handle,
        )
    os.replace(f"{OUT}.tmp", OUT)
    print(json.dumps({"devices": len(devices), "online": sum(1 for d in devices if d["online"])}))


if __name__ == "__main__":
    main()
