#!/usr/bin/env python3
"""Issue, rotate, revoke, and list hashed team MCP principals on the home node."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.request

ENV_FILE = Path(os.environ.get("CYJ_MCP_ENV_FILE", "/etc/changyi-jiuan-mcp.env"))
REGISTRY_FILE = Path(os.environ.get("CYJ_MCP_PRINCIPALS_FILE", "/etc/changyi-jiuan-mcp-principals.json"))
COMPOSE_FILE = Path(os.environ.get("CYJ_MCP_COMPOSE_FILE", "/opt/changyi-jiuan-mcp/runtime/current/compose.yaml"))
PROJECT_NAME = os.environ.get("CYJ_MCP_COMPOSE_PROJECT", "changyi-jiuan-mcp")
SERVICE_NAME = os.environ.get("CYJ_MCP_QUERY_SERVICE", "changyi-jiuan-mcp")
HEALTH_URL = os.environ.get("CYJ_MCP_HEALTH_URL", "http://127.0.0.1:8793/health")
MCP_URL = os.environ.get("CYJ_MCP_LOCAL_URL", "http://127.0.0.1:8793/mcp")
PRINCIPAL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@-]{0,119}$")


def require_root() -> None:
    if os.geteuid() != 0:
        raise SystemExit("Run this administrator command as root.")


def load_registry() -> list[dict[str, object]]:
    if not REGISTRY_FILE.exists():
        return []
    value = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
    if not isinstance(value, list):
        raise ValueError("Principal registry must be a JSON array")
    return value


def atomic_write(path: Path, content: str, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary_name, mode)
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def update_env(registry: list[dict[str, object]]) -> None:
    if not ENV_FILE.exists():
        raise FileNotFoundError(f"Missing MCP environment file: {ENV_FILE}")
    registry_json = json.dumps(registry, ensure_ascii=True, separators=(",", ":"))
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines()
    output: list[str] = []
    replaced = False
    for line in lines:
        if line.startswith("CYJ_MCP_PRINCIPALS_JSON="):
            output.append(f"CYJ_MCP_PRINCIPALS_JSON={registry_json}")
            replaced = True
        else:
            output.append(line)
    if not replaced:
        output.append(f"CYJ_MCP_PRINCIPALS_JSON={registry_json}")
    atomic_write(ENV_FILE, "\n".join(output) + "\n", ENV_FILE.stat().st_mode & 0o777)


def compose_apply() -> None:
    subprocess.run(
        [
            "docker", "compose", "-p", PROJECT_NAME, "-f", str(COMPOSE_FILE),
            "up", "-d", "--force-recreate", "--no-deps", SERVICE_NAME,
        ],
        check=True,
    )
    deadline = time.monotonic() + 45
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(HEALTH_URL, timeout=3) as response:
                if response.status == 200:
                    return
        except Exception as error:  # startup polling
            last_error = error
        time.sleep(1)
    raise RuntimeError(f"MCP health check did not recover: {last_error}")


def smoke_token(token: str) -> None:
    body = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "cyj-token-admin", "version": "1"},
        },
    }).encode("utf-8")
    request = urllib.request.Request(
        MCP_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status != 200:
            raise RuntimeError(f"New token smoke test returned HTTP {response.status}")


def commit_registry(registry: list[dict[str, object]], smoke: str | None = None) -> None:
    old_env = ENV_FILE.read_bytes()
    old_registry = REGISTRY_FILE.read_bytes() if REGISTRY_FILE.exists() else None
    try:
        atomic_write(REGISTRY_FILE, json.dumps(registry, ensure_ascii=False, indent=2) + "\n")
        update_env(registry)
        compose_apply()
        if smoke:
            smoke_token(smoke)
    except Exception:
        atomic_write(ENV_FILE, old_env.decode("utf-8"), ENV_FILE.stat().st_mode & 0o777)
        if old_registry is None:
            REGISTRY_FILE.unlink(missing_ok=True)
        else:
            atomic_write(REGISTRY_FILE, old_registry.decode("utf-8"))
        compose_apply()
        raise


def issue_or_rotate(principal_id: str, rotate: bool) -> None:
    if not PRINCIPAL_RE.fullmatch(principal_id):
        raise SystemExit("principal_id must use 1-120 letters, digits, dot, underscore, colon, @, or hyphen")
    registry = load_registry()
    existing = [entry for entry in registry if entry.get("principal_id") == principal_id]
    if existing and not rotate:
        raise SystemExit(f"Principal already exists: {principal_id}; use rotate instead")
    token = secrets.token_urlsafe(32)
    entry = {
        "token_sha256": hashlib.sha256(token.encode("utf-8")).hexdigest(),
        "principal_id": principal_id,
        "profile": "project-contribute",
        "roles": [],
    }
    registry = [item for item in registry if item.get("principal_id") != principal_id]
    registry.append(entry)
    registry.sort(key=lambda item: str(item.get("principal_id", "")))
    commit_registry(registry, smoke=token)
    print(json.dumps({"principal_id": principal_id, "profile": "project-contribute", "token": token}, ensure_ascii=False))


def revoke(principal_id: str) -> None:
    registry = load_registry()
    updated = [entry for entry in registry if entry.get("principal_id") != principal_id]
    if len(updated) == len(registry):
        raise SystemExit(f"Principal not found: {principal_id}")
    commit_registry(updated)
    print(json.dumps({"revoked": principal_id}, ensure_ascii=False))


def list_principals() -> None:
    safe = [
        {"principal_id": entry.get("principal_id"), "profile": entry.get("profile"), "roles": entry.get("roles", [])}
        for entry in load_registry()
    ]
    print(json.dumps(safe, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage individual Changyi Jiuan team MCP tokens")
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command in ("issue", "rotate", "revoke"):
        child = subparsers.add_parser(command)
        child.add_argument("principal_id")
    subparsers.add_parser("list")
    args = parser.parse_args()
    require_root()
    if args.command == "issue":
        issue_or_rotate(args.principal_id, rotate=False)
    elif args.command == "rotate":
        issue_or_rotate(args.principal_id, rotate=True)
    elif args.command == "revoke":
        revoke(args.principal_id)
    else:
        list_principals()


if __name__ == "__main__":
    main()
