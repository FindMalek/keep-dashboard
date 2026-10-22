#!/usr/bin/env python3
"""Read Backrest task history and write a summary for the dashboard.

Parses /srv/backrest/data/tasks/*.json, finds the latest completed backup task,
and writes /srv/keep-dashboard/backup-status.json.
"""

import json
import os
from datetime import datetime, timezone

TASKS_DIR = "/srv/backrest/data/tasks"
OUT = "/srv/keep-dashboard/backup-status.json"


def latest_task():
    if not os.path.isdir(TASKS_DIR):
        return None
    tasks = []
    for name in os.listdir(TASKS_DIR):
        if not name.endswith(".json"):
            continue
        try:
            with open(os.path.join(TASKS_DIR, name)) as handle:
                tasks.append(json.load(handle))
        except (OSError, json.JSONDecodeError):
            continue
    if not tasks:
        return None
    # Prefer tasks with an endTime, falling back to startTime.
    tasks.sort(key=lambda t: t.get("endTime") or t.get("startTime") or "", reverse=True)
    return tasks[0]


def duration_sec(task):
    start = task.get("startTime")
    end = task.get("endTime")
    if not start or not end:
        return None
    try:
        return int((datetime.fromisoformat(end) - datetime.fromisoformat(start)).total_seconds())
    except ValueError:
        return None


def size_bytes(task):
    summary = task.get("summary") or {}
    for key in ("totalBytesUploaded", "totalBytesProcessed", "totalBytes", "bytesUploaded"):
        if key in summary:
            return int(summary[key])
    return None


def main():
    task = latest_task()
    if task is None:
        status = {"at": None, "status": "unknown", "sizeBytes": None, "durationSec": None}
    else:
        status = {
            "at": task.get("endTime") or task.get("startTime"),
            "status": task.get("status", "unknown").lower(),
            "sizeBytes": size_bytes(task),
            "durationSec": duration_sec(task),
        }
        if status["status"] not in ("success", "failed", "running"):
            status["status"] = "unknown"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(f"{OUT}.tmp", "w") as handle:
        json.dump(status, handle)
    os.replace(f"{OUT}.tmp", OUT)
    print(json.dumps(status))


if __name__ == "__main__":
    main()
