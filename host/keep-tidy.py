#!/usr/bin/env python3
"""Free disk space on the-keep without touching anything that holds data.

Docker volumes, /srv data and running containers are never touched. Writes a summary to
/srv/keep-dashboard/tidy.json for the dashboard.
"""

import json
import os
import shutil
import subprocess
from datetime import datetime, timezone

SUMMARY = os.path.join(os.environ.get("KEEP_DATA", "/srv/keep-dashboard"), "tidy.json")

STEPS = [
    ("dokploy deployments and orphaned folders", ["/usr/local/bin/keep-cleanup"]),
    ("stopped containers older than 24h", ["docker", "container", "prune", "--force", "--filter", "until=24h"]),
    ("dangling images", ["docker", "image", "prune", "--force"]),
    ("build cache older than 7 days", ["docker", "builder", "prune", "--force", "--filter", "until=168h"]),
    ("journal logs older than 14 days", ["journalctl", "--vacuum-time=14d"]),
    ("apt package cache", ["apt-get", "clean"]),
    ("expired temp files", ["systemd-tmpfiles", "--clean"]),
]


def used_bytes():
    return sum(shutil.disk_usage(path).used for path in ("/", "/srv"))


def main():
    before = used_bytes()
    steps = []
    for label, command in STEPS:
        result = subprocess.run(command, capture_output=True, text=True)
        steps.append({"label": label, "ok": result.returncode == 0})
    freed = max(0, before - used_bytes())

    summary = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "freedBytes": freed, "steps": steps}
    print(json.dumps(summary))
    os.makedirs(os.path.dirname(SUMMARY), exist_ok=True)
    with open(SUMMARY, "w") as handle:
        json.dump(summary, handle)


if __name__ == "__main__":
    main()
