#!/usr/bin/env python3
"""Nightly dump of every running Postgres / MySQL / MariaDB container.

Dumps go to /srv/backrest/staging/postgres so Backrest can back them up.
Run from a systemd timer (e.g. keep-backup-pgdump.timer at 03:00 UTC).
"""

import json
import os
import re
import subprocess
from datetime import datetime, timezone

STAGING = "/srv/backrest/staging/postgres"


def docker(*args):
    return subprocess.run(["docker", *args], capture_output=True, text=True, check=True)


def container_env(container_name):
    """Read the container's environment as a dict."""
    out = docker("exec", container_name, "env").stdout
    result = {}
    for line in out.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            result[key] = value
    return result


def containers():
    """Find running database containers by image name."""
    out = docker("ps", "--format", "{{json .}}", "--filter", "status=running").stdout
    for line in out.splitlines():
        container = json.loads(line)
        image = container.get("Image", "").lower()
        if "postgres" in image:
            yield container["Names"], "postgres"
        elif "mariadb" in image:
            yield container["Names"], "mariadb"
        elif "mysql" in image:
            yield container["Names"], "mysql"


def safe_name(name):
    return re.sub(r"[^a-z0-9_-]", "-", name.lower()).strip("-")


def dump_postgres(container_name, env):
    user = env.get("POSTGRES_USER") or env.get("PGUSER") or "postgres"
    password = env.get("POSTGRES_PASSWORD") or env.get("PGPASSWORD") or ""
    path = os.path.join(STAGING, f"{safe_name(container_name)}-postgres.sql")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp"
    subprocess.run(
        ["docker", "exec", "-e", f"PGPASSWORD={password}", container_name, "pg_dumpall", "-U", user],
        stdout=open(tmp, "w"),
        stderr=subprocess.PIPE,
        check=True,
    )
    os.replace(tmp, path)
    return path


def dump_mysql(container_name, env, kind):
    # MariaDB images often set MARIADB_ROOT_PASSWORD; MySQL images set MYSQL_ROOT_PASSWORD.
    password = env.get("MARIADB_ROOT_PASSWORD") or env.get("MYSQL_ROOT_PASSWORD") or ""
    user = "root"
    path = os.path.join(STAGING, f"{safe_name(container_name)}-{kind}.sql")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp"
    subprocess.run(
        ["docker", "exec", "-e", f"MYSQL_PWD={password}", container_name, "mysqldump", "-u", user, "--all-databases"],
        stdout=open(tmp, "w"),
        stderr=subprocess.PIPE,
        check=True,
    )
    os.replace(tmp, path)
    return path


def main():
    os.makedirs(STAGING, exist_ok=True)
    for container_name, kind in containers():
        try:
            env = container_env(container_name)
            if kind == "postgres":
                path = dump_postgres(container_name, env)
            else:
                path = dump_mysql(container_name, env, kind)
            print(f"dumped {container_name} -> {path}")
        except subprocess.CalledProcessError as error:
            print(f"failed {container_name}: {error.stderr}", file=os.sys.stderr)

    with open(os.path.join(STAGING, "last-run.json"), "w") as handle:
        json.dump({"at": datetime.now(timezone.utc).isoformat(timespec="seconds")}, handle)


if __name__ == "__main__":
    main()
