#!/usr/bin/env python3
"""Monthly unattended-upgrades check + reboot if needed.

Runs from keep-upgrade.service, triggered by keep-upgrade.timer (first Sunday
after keep-tidy). If /var/run/reboot-required exists, ntfy before and after,
then reboot. Never reboots twice in one day.
"""

import json
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

REBOOT_REQUIRED = "/var/run/reboot-required"
STATE = "/srv/keep-dashboard/upgrade-state.json"
NTFY_TOPIC_FILE = "/srv/uptime-kuma/admin.env"


def notify(title, message, priority=3):
    try:
        topic = dict(line.split("=", 1) for line in open(NTFY_TOPIC_FILE).read().split())["NTFY_TOPIC"]
        request = urllib.request.Request(
            f"https://ntfy.sh/{topic}",
            data=message.encode(),
            method="POST",
            headers={"Title": title, "Priority": str(priority), "Tags": "gear"},
        )
        urllib.request.urlopen(request, timeout=10)
    except Exception as error:
        print(f"ntfy failed: {error}", file=sys.stderr)


def load_state():
    try:
        return json.load(open(STATE))
    except (OSError, ValueError):
        return {}


def save_state(state):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    with open(f"{STATE}.tmp", "w") as handle:
        json.dump(state, handle)
    os.replace(f"{STATE}.tmp", STATE)


def main():
    state = load_state()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if state.get("rebooted") == today:
        print("already rebooted today")
        return

    if not os.path.exists(REBOOT_REQUIRED):
        print("no reboot required")
        state.pop("rebooted", None)
        save_state(state)
        return

    notify("the-keep: rebooting for updates", "a new kernel or critical update requires a reboot; starting now", priority=4)
    save_state({"rebooted": today, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    subprocess.run(["systemctl", "reboot"])


if __name__ == "__main__":
    main()
