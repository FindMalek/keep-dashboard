#!/usr/bin/env python3
"""Discover active devices on the LAN and write them for the dashboard.

Runs every 5 minutes from keep-network-devices.timer.
Tries multiple discovery methods:
  1. arp-scan (ARP probes, no reliance on ICMP replies)
  2. ping sweep of 192.168.1.0/24
  3. /proc/net/arp and `ip neigh`

Resolves names via mDNS (avahi) then reverse DNS.
Storage is only shown for the-keep itself.
"""

import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone

OUT = "/srv/keep-dashboard/network-devices.json"
SUBNET = "192.168.1"
TIMEOUT_S = "2"
KEEP_LAN_IP = "192.168.1.81"


def run(*args, timeout=15):
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
                entries[ip] = {"mac": mac.upper(), "state": state}
    except OSError:
        pass
    return entries


def parse_ip_neigh():
    """Read the kernel neighbour table as a fallback."""
    entries = {}
    if not shutil.which("ip"):
        return entries
    result = run("ip", "neigh", "show")
    for line in result.stdout.splitlines():
        parts = line.strip().split()
        if len(parts) < 4:
            continue
        ip = parts[0]
        state = parts[-1]
        try:
            mac_idx = parts.index("lladdr") + 1
            mac = parts[mac_idx]
        except (ValueError, IndexError):
            continue
        if not re.match(r"^([0-9a-f]{2}:){5}[0-9a-f]{2}$", mac, re.I):
            continue
        entries[ip] = {"mac": mac.upper(), "state": state}
    return entries


def arp_scan():
    """Use arp-scan to actively probe every IP on the subnet."""
    if not shutil.which("arp-scan"):
        return {}
    entries = {}
    result = run("arp-scan", "-q", "-l", "-I", "eth0", f"{SUBNET}.0/24", timeout=60)
    # Also try common interface names if eth0 fails.
    if result.returncode != 0:
        for iface in ("enp", "ens", "wlan", "br-"):
            # Find first matching interface.
            try:
                iface_name = next(
                    line.split()[0]
                    for line in run("ip", "link", "show").stdout.splitlines()
                    if f"{iface}" in line and "state UP" in line
                )
                result = run("arp-scan", "-q", "-l", "-I", iface_name, f"{SUBNET}.0/24", timeout=60)
                if result.returncode == 0:
                    break
            except StopIteration:
                continue
    for line in result.stdout.splitlines():
        match = re.match(r"^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\s+([0-9a-f:]{17})", line, re.I)
        if match:
            ip, mac = match.groups()
            entries[ip] = {"mac": mac.upper(), "state": "REACHABLE"}
    return entries


def ping(ip):
    result = run("ping", "-c", "1", "-W", TIMEOUT_S, ip, timeout=5)
    return result.returncode == 0


def mdns_name(ip):
    if not shutil.which("avahi-resolve-address"):
        return None
    result = run("avahi-resolve-address", ip, timeout=5)
    if result.returncode != 0:
        return None
    parts = result.stdout.strip().split()
    return parts[1] if len(parts) >= 2 else None


def dns_name(ip):
    result = run("dig", "+short", "+time=1", "+tries=1", "-x", ip, timeout=5)
    if result.returncode != 0:
        return None
    name = result.stdout.strip().splitlines()[0] if result.stdout.strip() else None
    return name.rstrip(".") if name else None


def hostname(ip):
    return mdns_name(ip) or dns_name(ip)


def vendor(mac):
    """Best-effort vendor from MAC OUI using ieee-data if available."""
    if not shutil.which("arp"):
        return None
    result = run("arp", "-a", timeout=5)
    for line in result.stdout.splitlines():
        if mac.lower() in line.lower():
            return None  # arp -a doesn't give vendor; placeholder
    return None


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
    neigh = parse_ip_neigh()
    scanned = arp_scan()

    # Merge all known MAC sources.
    by_ip = {}
    for source in (arp, neigh, scanned):
        for ip, entry in source.items():
            if ip in by_ip:
                by_ip[ip]["mac"] = by_ip[ip].get("mac") or entry.get("mac")
                by_ip[ip]["state"] = entry.get("state") or by_ip[ip].get("state")
            else:
                by_ip[ip] = entry.copy()

    online = set()

    # Ping sweep in larger batches, but only for IPs we haven't already seen via ARP.
    known_ips = set(by_ip.keys())
    ips_to_ping = [f"{SUBNET}.{i}" for i in range(1, 255) if f"{SUBNET}.{i}" not in known_ips]
    batch = 40
    for i in range(0, len(ips_to_ping), batch):
        processes = []
        for ip in ips_to_ping[i : i + batch]:
            proc = subprocess.Popen(
                ["ping", "-c", "1", "-W", TIMEOUT_S, ip],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            processes.append((ip, proc))
        for ip, proc in processes:
            try:
                if proc.wait(5) == 0:
                    online.add(ip)
            except subprocess.TimeoutExpired:
                proc.kill()

    candidates = set(online) | set(by_ip.keys())
    devices = []
    storage = keep_storage()

    for ip in sorted(candidates, key=lambda x: [int(n) for n in x.split(".")]):
        entry = by_ip.get(ip, {})
        name = hostname(ip) or entry.get("mac") or ip
        is_online = ip in online or entry.get("state") in ("REACHABLE", "STALE", "DELAY", "PROBE")
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
