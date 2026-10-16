#!/usr/bin/env python3
"""Host side of the dashboard's buttons and jobs page.

  keep-agent process   handle request files the dashboard drops in requests/ (systemd path unit)
  keep-agent status    write jobs.json (every keep-* timer) and activity.json (devices, logins, sudo, boots)

The dashboard can only ask; this script decides. Unknown actions are refused and logged.
"""

import glob
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

DATA = os.environ.get("KEEP_DATA", "/srv/keep-dashboard")
REQUESTS = f"{DATA}/requests"
ACTIONS_LOG = f"{DATA}/actions.json"
JOBS_FILE = f"{DATA}/jobs.json"
ACTIVITY_FILE = f"{DATA}/activity.json"
ACTIVITY_DAYS = 7
MAX_EVENTS = 2000
MIN_UPTIME_FOR_REBOOT_SEC = 300

# Which systemd timers the jobs page shows (name → description; "run now" starts <name>.service), plus entries
# that aren't timers here (scheduled elsewhere, or planned). Edit <KEEP_DATA>/agent.json:
#   {"jobs": {"keep-cleanup": "prunes old deployments"}, "external": [{"name": "...", "description": "...",
#    "schedule": "daily 23:50 utc", "planned": false}]}
# Apps that sleep when idle get start/stop buttons ("switches": name → docker ps filters):
#   {"switches": {"minecraft": {"description": "game server", "filters": ["label=com.docker.compose.service=minecraft"]}}}
DEFAULT_JOBS = {
    "keep-cleanup": "prunes old dokploy deployments",
    "keep-tidy": "frees disk space",
}


def load_config():
    try:
        config = json.load(open(f"{DATA}/agent.json"))
    except (OSError, ValueError):
        config = {}
    return config.get("jobs", DEFAULT_JOBS), config.get("external", []), config.get("switches", {})


JOBS, EXTERNAL, SWITCHES = load_config()


def switch_container(name):
    """(id, state) of the one container a switch's filters match; (None, None) if none, several or no filters."""
    filters = SWITCHES[name].get("filters") or []
    if not filters:
        return None, None
    args = ["docker", "ps", "-a", "--format", "{{.ID}} {{.State}}"]
    for value in filters:
        args += ["--filter", value]
    try:
        lines = subprocess.run(args, capture_output=True, text=True, timeout=20).stdout.splitlines()
    except subprocess.TimeoutExpired:
        return None, None
    if len(lines) != 1:
        return None, None
    container, _, state = lines[0].partition(" ")
    return container, state


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def show(unit, *props):
    out = subprocess.run(
        ["systemctl", "show", unit, "--timestamp=unix", *[f"-p{p}" for p in props]],
        capture_output=True, text=True,
    ).stdout
    props = {}
    for line in out.splitlines():
        key, _, value = line.partition("=")
        # A timer with several triggers repeats the property once per trigger.
        props[key] = f"{props[key]}\n{value}" if key in props else value
    return props


def timespan_sec(value):
    units = {"d": 86400, "h": 3600, "min": 60, "s": 1, "ms": 0.001, "us": 0.000001}
    return sum(float(n) * units[u] for n, u in re.findall(r"([\d.]+)(d|h|min|ms|us|s)\b", value or ""))


def unix(value):
    match = re.match(r"@(\d+)", value or "")
    return int(match.group(1)) if match else None


def schedule_of(timer):
    calendar = re.search(r"OnCalendar=([^;]+?)\s*;", timer.get("TimersCalendar", ""))
    if calendar:
        spec = calendar.group(1).strip()
        daily = re.fullmatch(r"\*-\*-\* (\d\d:\d\d):00", spec)
        if daily:
            return f"daily {daily.group(1)} utc"
        weekly = re.fullmatch(r"(\w{3}) \*-\*-\* (\d\d:\d\d):00", spec)
        if weekly:
            days = {"mon": "mondays", "tue": "tuesdays", "wed": "wednesdays", "thu": "thursdays", "fri": "fridays", "sat": "saturdays", "sun": "sundays"}
            return f"{days.get(weekly.group(1).lower(), weekly.group(1))} {weekly.group(2)} utc"
        return spec
    every = re.search(r"OnUnitActiveUSec=(\S+)", timer.get("TimersMonotonic", ""))
    return f"every {every.group(1)}" if every else "manual"


def next_from_boot(value):
    """Monotonic timers report their next run as time since boot."""
    if not value:
        return None
    uptime = float(open("/proc/uptime").read().split()[0])
    return int(datetime.now(timezone.utc).timestamp() - uptime + timespan_sec(value))


def write_status():
    jobs = []
    for name, description in JOBS.items():
        timer = show(f"{name}.timer", "TimersCalendar", "TimersMonotonic", "NextElapseUSecRealtime", "NextElapseUSecMonotonic", "LoadState")
        service = show(f"{name}.service", "Result", "ActiveState", "ExecMainStartTimestamp", "ExecMainExitTimestamp")
        if timer.get("LoadState") != "loaded":
            continue
        started, exited = unix(service.get("ExecMainStartTimestamp")), unix(service.get("ExecMainExitTimestamp"))
        running = service.get("ActiveState") in ("activating", "active")
        jobs.append({
            "name": name,
            "description": description,
            "schedule": schedule_of(timer),
            "lastRun": started,
            "lastResult": "running" if running else ("success" if service.get("Result") == "success" else "failed") if started else None,
            "durationSec": exited - started if started and exited and exited >= started else None,
            "nextRun": unix(timer.get("NextElapseUSecRealtime")) or next_from_boot(timer.get("NextElapseUSecMonotonic")),
            "runnable": True,
        })
    for job in EXTERNAL:
        jobs.append({"planned": False, **job, "lastRun": None, "lastResult": None, "durationSec": None, "nextRun": None, "runnable": False})
    switches = [{"name": name, "description": entry.get("description", ""), "running": switch_container(name)[1] == "running"}
                for name, entry in SWITCHES.items()]
    write_json(JOBS_FILE, {"updatedAt": now_iso(), "jobs": jobs, "switches": switches})


def journal(*args):
    out = subprocess.run(
        ["journalctl", "--no-pager", "-o", "json", "--since", f"-{ACTIVITY_DAYS}d", *args],
        capture_output=True, text=True,
    ).stdout
    for line in out.splitlines():
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        message = entry.get("MESSAGE")
        if isinstance(message, str):
            yield int(entry["__REALTIME_TIMESTAMP"]) // 1_000_000, entry.get("_PID"), message


def devices():
    try:
        status = json.loads(subprocess.run(["tailscale", "status", "--json"], capture_output=True, text=True).stdout)
    except ValueError:
        return []
    result = []
    for peer in [status.get("Self", {}), *status.get("Peer", {}).values()]:
        if not peer:
            continue
        cur = peer.get("CurAddr") or ""
        result.append({
            "name": peer.get("HostName", "?"),
            "os": peer.get("OS", ""),
            "self": peer is status.get("Self"),
            "tailscaleIp": (peer.get("TailscaleIPs") or [None])[0],
            # The address a peer is reached at directly, e.g. its LAN IP; lets us name LAN connections.
            "lanIp": cur.rsplit(":", 1)[0] if cur and not cur.startswith("[") else None,
            "online": bool(peer.get("Online")) or peer is status.get("Self"),
            "lastSeen": None if (peer.get("LastSeen") or "").startswith("0001") else peer.get("LastSeen"),
            "route": "self" if peer is status.get("Self") else ("direct" if cur else (f"relay {peer['Relay']}" if peer.get("Relay") else "—")),
            "rxBytes": peer.get("RxBytes", 0),
            "txBytes": peer.get("TxBytes", 0),
        })
    return result


def open_sessions_now():
    """Remote logins systemd still considers open (journal close lines don't always pair up)."""
    try:
        listed = json.loads(subprocess.run(["loginctl", "list-sessions", "--json=short"], capture_output=True, text=True).stdout or "[]")
    except ValueError:
        return []
    sessions = []
    for item in listed:
        info = show_session(item["session"])
        if info.get("Remote") != "yes":
            continue
        sessions.append({
            "id": item["session"],
            "user": info.get("Name"),
            "source": info.get("RemoteHost") or None,
            "since": parse_local_time(info.get("Timestamp")),
            "tty": info.get("TTY") or None,
        })
    return sessions


def parse_local_time(value):
    """`Sun 2026-10-11 17:21:25 UTC` → unix seconds (the server runs in UTC)."""
    try:
        return int(datetime.strptime(value, "%a %Y-%m-%d %H:%M:%S UTC").replace(tzinfo=timezone.utc).timestamp())
    except (TypeError, ValueError):
        return None


def show_session(session_id):
    out = subprocess.run(
        ["loginctl", "show-session", session_id, "-pName", "-pRemote", "-pRemoteHost", "-pTimestamp", "-pTTY"],
        capture_output=True, text=True,
    ).stdout
    return dict(line.split("=", 1) for line in out.splitlines() if "=" in line)


def write_activity():
    events, open_sessions = [], {}
    accepted = re.compile(r"Accepted (\S+) for (\S+) from (\S+) port \d+ ssh2(?:: (\S+) (\S+))?")
    failed = re.compile(r"(?:Invalid user (\S+)|Failed \S+ for (?:invalid user )?(\S+)|Connection closed by authenticating user (\S+)) from (\S+)")
    for at, pid, message in journal("-u", "ssh", "-u", "sshd"):
        if m := accepted.search(message):
            open_sessions[pid] = {"at": at, "kind": "ssh", "user": m[2], "source": m[3],
                                  "detail": f"{m[1]} login", "key": m[5][-8:] if m[5] else None, "endedAt": None}
            events.append(open_sessions[pid])
        elif "session closed" in message and pid in open_sessions:
            open_sessions.pop(pid)["endedAt"] = at
        elif m := failed.search(message):
            events.append({"at": at, "kind": "ssh-failed", "user": m[1] or m[2] or m[3], "source": m[4],
                           "detail": "failed login", "key": None, "endedAt": None})

    sudo = re.compile(r"^\s*(\S+) : .*?COMMAND=(.+)$")
    for at, _, message in journal("_COMM=sudo"):
        if m := sudo.search(message):
            events.append({"at": at, "kind": "sudo", "user": m[1], "source": None, "detail": m[2][:200], "key": None, "endedAt": None})

    boots = json.loads(subprocess.run(["journalctl", "--list-boots", "-o", "json"], capture_output=True, text=True).stdout or "[]")
    for boot in boots:
        at = int(boot.get("first_entry", 0)) // 1_000_000
        if at > time.time() - ACTIVITY_DAYS * 86400:
            events.append({"at": at, "kind": "boot", "user": None, "source": None, "detail": "server started", "key": None, "endedAt": None})

    events.sort(key=lambda event: event["at"], reverse=True)
    write_json(ACTIVITY_FILE, {
        "updatedAt": now_iso(),
        "devices": devices(),
        "openSessions": open_sessions_now(),
        # Failed logins and boots are rare and matter most, so the cap never pushes them out.
        "events": sorted(
            [e for e in events if e["kind"] in ("ssh-failed", "boot")]
            + [e for e in events if e["kind"] not in ("ssh-failed", "boot")][:MAX_EVENTS],
            key=lambda event: event["at"], reverse=True,
        ),
    })


def write_json(path, value):
    tmp = f"{path}.tmp"
    with open(tmp, "w") as handle:
        json.dump(value, handle)
    os.replace(tmp, path)


def log_action(action, status, detail):
    try:
        with open(ACTIONS_LOG) as handle:
            history = json.load(handle)
    except (OSError, ValueError):
        history = []
    history = ([{"action": action, "at": now_iso(), "status": status, "detail": detail}] + history)[:20]
    write_json(ACTIONS_LOG, history)


def handle_action(action):
    if action == "reboot":
        uptime = float(open("/proc/uptime").read().split()[0])
        if uptime < MIN_UPTIME_FOR_REBOOT_SEC:
            return log_action(action, "refused", "booted less than 5 minutes ago")
        log_action(action, "done", "rebooting now")
        write_status()
        subprocess.run(["systemctl", "reboot"])
        return None
    if action == "tidy":
        result = subprocess.run(["systemctl", "start", "keep-tidy.service"], capture_output=True, text=True)
        return log_action(action, "done" if result.returncode == 0 else "failed", result.stderr.strip() or "finished")
    if action.startswith("run:") and action[4:] in JOBS:
        unit = f"{action[4:]}.service"
        result = subprocess.run(["systemctl", "start", "--no-block", unit], capture_output=True, text=True)
        return log_action(action, "done" if result.returncode == 0 else "failed", result.stderr.strip() or "started")
    verb, _, name = action.partition(":")
    if verb in ("start", "stop") and name in SWITCHES:
        container, _ = switch_container(name)
        if not container:
            return log_action(action, "failed", "needs exactly one matching container")
        try:
            # Stopping waits for the app's own shutdown (minecraft saves the world first).
            result = subprocess.run(["docker", verb, container], capture_output=True, text=True, timeout=150)
        except subprocess.TimeoutExpired:
            return log_action(action, "failed", "docker didn't answer")
        return log_action(action, "done" if result.returncode == 0 else "failed", result.stderr.strip() or ("started" if verb == "start" else "stopped"))
    return log_action(action[:60], "refused", "unknown action")


def process():
    for path in sorted(glob.glob(f"{REQUESTS}/*.json")):
        try:
            with open(path) as handle:
                action = str(json.load(handle).get("action", ""))
        except (OSError, ValueError):
            action = "unreadable request"
        os.remove(path)
        handle_action(action)
    write_status()


if __name__ == "__main__":
    os.makedirs(REQUESTS, exist_ok=True)
    command = sys.argv[1] if len(sys.argv) > 1 else "status"
    if command == "process":
        process()
    else:
        write_status()
        write_activity()
