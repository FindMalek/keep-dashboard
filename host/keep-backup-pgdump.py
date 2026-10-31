#!/usr/bin/env python3
"""Nightly dump of every running Postgres / MySQL / MariaDB container.

Dumps go to /srv/backrest/staging/postgres so Backrest can back them up.
Run from a systemd timer (e.g. keep-backup-pgdump.timer at 03:00 UTC).
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

STAGING = "/srv/backrest/staging/postgres"


def write_dump(cmd, env_name, password, path):
    """Run a dump into a 0600 temp file; the password goes via the client env, never argv."""
    os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
    tmp = f"{path}.tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w") as out:
            subprocess.run(
                ["docker", "exec", "-e", env_name, *cmd],
                stdout=out,
                stderr=subprocess.PIPE,
                text=True,
                check=True,
                env={**os.environ, env_name: password},
            )
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return path


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
    return write_dump([container_name, "pg_dumpall", "-U", user], "PGPASSWORD", password, path)


def dump_mysql(container_name, env, kind):
    # MariaDB images often set MARIADB_ROOT_PASSWORD; MySQL images set MYSQL_ROOT_PASSWORD.
    password = env.get("MARIADB_ROOT_PASSWORD") or env.get("MYSQL_ROOT_PASSWORD") or ""
    user = "root"
    path = os.path.join(STAGING, f"{safe_name(container_name)}-{kind}.sql")
    cmd = [container_name, "mysqldump", "-u", user, "--all-databases", "--routines", "--events", "--single-transaction"]
    return write_dump(cmd, "MYSQL_PWD", password, path)


def main():
    os.umask(0o077)
    os.makedirs(STAGING, mode=0o700, exist_ok=True)
    failed = []
    for container_name, kind in containers():
        try:
            env = container_env(container_name)
            if kind == "postgres":
                path = dump_postgres(container_name, env)
            else:
                path = dump_mysql(container_name, env, kind)
            print(f"dumped {container_name} -> {path}")
        except subprocess.CalledProcessError as error:
            failed.append(container_name)
            print(f"failed {container_name}: {error.stderr}", file=sys.stderr)

    with open(os.path.join(STAGING, "last-run.json"), "w") as handle:
        json.dump({"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "failed": failed}, handle)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
