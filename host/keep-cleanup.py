#!/usr/bin/env python3
"""Nightly Dokploy tidy-up on the-keep.

Docker leftovers (stopped containers, unused images, build cache) are keep-tidy's job; Dokploy's own
daily cleanup is off on the keep because it also deleted apps that sleep. This covers Dokploy's side:
deployments beyond the newest 3 per service (failed, stuck or just old), and log/code folders
of services deleted from Dokploy.
Containers Dokploy doesn't know about are only reported, never removed.

Usage: keep-cleanup [--dry-run]
"""

import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

KEEP_LATEST = 3
STUCK_AFTER_SEC = 2 * 3600
ORPHAN_DIR_AFTER_SEC = 7 * 86400
DOKPLOY = "/etc/dokploy"
HISTORY = os.path.join(os.environ.get("KEEP_DATA", "/srv/keep-dashboard"), "cleanup-runs.json")
MAX_RUNS = 30
DEPLOYABLE = {"applications": ("application", "applicationId"), "compose": ("compose", "composeId")}

dry_run = "--dry-run" in sys.argv
now = time.time()


def dk(method, procedure, body=None):
    args = ["/usr/local/bin/dk", method, procedure] + ([json.dumps(body)] if body is not None else [])
    out = subprocess.run(args, capture_output=True, text=True, check=True).stdout
    return json.loads(out) if out.strip() else None


def age(iso):
    return now - datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def deployments_of(kind, service_id):
    if kind == "compose":
        return dk("GET", f"deployment.allByCompose?composeId={service_id}") or []
    return dk("GET", f"deployment.all?applicationId={service_id}") or []


def main():
    started = time.monotonic()
    removed, app_names = [], set()

    for project in dk("GET", "project.all"):
        for environment in project["environments"]:
            for key, (kind, id_field) in DEPLOYABLE.items():
                for service in environment.get(key, []):
                    detail = dk("GET", f"{kind}.one?{id_field}={service[id_field]}")
                    app_names.add(detail["appName"])
                    history = sorted(deployments_of(kind, service[id_field]), key=lambda d: d["createdAt"], reverse=True)
                    # The newest few stay whatever their state: the first is what's running, the rest are
                    # recent context. Anything older goes, except a build that may still be running.
                    for index, deployment in enumerate(history):
                        stuck = deployment["status"] == "running" and age(deployment["createdAt"]) > STUCK_AFTER_SEC
                        if index < KEEP_LATEST and not (index > 0 and stuck):
                            continue
                        if deployment["status"] == "running" and not stuck:
                            continue
                        removed.append({
                            "type": "deployment",
                            "id": deployment["deploymentId"],
                            "project": project["name"],
                            "service": service["name"],
                            "title": deployment.get("title") or "deployment",
                            "status": deployment["status"],
                            "createdAt": deployment["createdAt"],
                            "reason": "stuck" if stuck else {"error": "failed"}.get(deployment["status"], "older than newest 3"),
                        })
                        if not dry_run:
                            dk("POST", "deployment.removeDeployment", {"deploymentId": deployment["deploymentId"]})

    for folder in ("logs", "compose", "applications"):
        base = os.path.join(DOKPLOY, folder)
        for name in sorted(os.listdir(base)) if os.path.isdir(base) else []:
            path = os.path.join(base, name)
            if name in app_names or not os.path.isdir(path) or now - os.path.getmtime(path) < ORPHAN_DIR_AFTER_SEC:
                continue
            removed.append({"type": "folder", "id": name, "path": path, "reason": "service deleted from dokploy"})
            if not dry_run:
                shutil.rmtree(path)

    listing = subprocess.run(
        ["docker", "ps", "-a", "--format", "{{json .}}"], capture_output=True, text=True, check=True
    ).stdout
    unmanaged = []
    for container in map(json.loads, listing.splitlines()):
        labels = dict(item.split("=", 1) for item in container.get("Labels", "").split(",") if "=" in item)
        stack = labels.get("com.docker.compose.project") or labels.get("com.docker.swarm.service.name") or ""
        if container["Names"].startswith("dokploy") or stack.startswith("dokploy") or stack in app_names:
            continue
        unmanaged.append({"id": container["ID"], "name": container["Names"], "state": container["State"], "stack": stack or None})

    run = {
        "id": datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S"),
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "durationMs": round((time.monotonic() - started) * 1000),
        "dryRun": dry_run,
        "removed": removed,
        "unmanaged": unmanaged,
    }
    print(json.dumps(run, indent=2))
    if dry_run:
        return
    try:
        with open(HISTORY) as handle:
            runs = json.load(handle)
    except (OSError, ValueError):
        runs = []
    os.makedirs(os.path.dirname(HISTORY), exist_ok=True)
    with open(f"{HISTORY}.tmp", "w") as handle:
        json.dump(([run] + runs)[:MAX_RUNS], handle)
    os.replace(f"{HISTORY}.tmp", HISTORY)


if __name__ == "__main__":
    main()
