#!/usr/bin/env python3
"""Private runtime adapter for the Xpert NsJail sandbox provider.

Invariants:
- Workspace paths are constrained to XPERT_NSJAIL_WORKSPACE_ROOT.
- RPC callers cannot choose mounts, host PIDs, NsJail flags, or executables.
- Runtime state is process-local; container restart safely loses and reaps it.
- Idle runtimes are destroyed after the configured inactivity timeout.
"""

from __future__ import annotations

import base64
import binascii
import datetime as dt
import errno
import fcntl
import hmac
import json
import math
import os
import pathlib
import pty
import re
import shutil
import signal
import stat
import struct
import subprocess
import termios
import threading
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, BinaryIO, Callable, Iterator
from urllib.parse import parse_qs, unquote, urlsplit

RUNNER_HOST = os.environ.get("XPERT_NSJAIL_RUNNER_HOST", "0.0.0.0")
RUNNER_PORT = int(os.environ.get("XPERT_NSJAIL_RUNNER_PORT", "8090"))
RUNNER_TOKEN = os.environ.get("XPERT_NSJAIL_RUNNER_TOKEN", "").strip()
WORKSPACE_ROOT = pathlib.Path(os.environ.get("XPERT_NSJAIL_WORKSPACE_ROOT", "/sandbox")).resolve()
ROOTFS = pathlib.Path(os.environ.get("XPERT_NSJAIL_ROOTFS", "/opt/xpert-rootfs")).resolve()
STATE_ROOT = pathlib.Path(os.environ.get("XPERT_NSJAIL_STATE_ROOT", "/var/lib/xpert-nsjail")).resolve()
STATE_ROOT_BASE = pathlib.Path("/var/lib/xpert-nsjail")
STATE_MARKER_NAME = ".xpert-nsjail-state"
STATE_MARKER_CONTENT = "xpert-nsjail-runner-state-v1\n"
NSJAIL_BIN = os.environ.get("XPERT_NSJAIL_BIN", "/usr/local/bin/nsjail")
SECCOMP_POLICY = os.environ.get("XPERT_NSJAIL_SECCOMP_POLICY", "/etc/xpert-nsjail/seccomp.policy")
USE_CGROUP_V2 = os.environ.get("XPERT_NSJAIL_USE_CGROUP_V2", "true").lower() == "true"
MAX_RUNTIMES = int(os.environ.get("XPERT_NSJAIL_MAX_RUNTIMES", "100"))
RUNTIME_IDLE_TTL_SECONDS = int(os.environ.get("XPERT_NSJAIL_RUNTIME_IDLE_TTL_SECONDS", str(2 * 60 * 60)))
RUNTIME_REAPER_INTERVAL_SECONDS = int(os.environ.get("XPERT_NSJAIL_REAPER_INTERVAL_SECONDS", "60"))
MAX_REQUEST_BYTES = int(os.environ.get("XPERT_NSJAIL_MAX_REQUEST_BYTES", str(64 * 1024 * 1024)))
MAX_FILE_BYTES = int(os.environ.get("XPERT_NSJAIL_MAX_FILE_BYTES", str(32 * 1024 * 1024)))
MAX_LOG_READ_BYTES = int(os.environ.get("XPERT_NSJAIL_MAX_LOG_READ_BYTES", str(4 * 1024 * 1024)))
MAX_SERVICE_LOG_BYTES = int(os.environ.get("XPERT_NSJAIL_MAX_SERVICE_LOG_BYTES", str(4 * 1024 * 1024)))
MAX_SERVICES_PER_RUNTIME = int(os.environ.get("XPERT_NSJAIL_MAX_SERVICES_PER_RUNTIME", "16"))
MAX_TERMINALS_PER_RUNTIME = int(os.environ.get("XPERT_NSJAIL_MAX_TERMINALS_PER_RUNTIME", "8"))
MAX_EXECUTIONS_GLOBAL = int(os.environ.get("XPERT_NSJAIL_MAX_EXECUTIONS_GLOBAL", "32"))
MAX_EXECUTIONS_PER_RUNTIME = int(os.environ.get("XPERT_NSJAIL_MAX_EXECUTIONS_PER_RUNTIME", "4"))
MAX_DOWNLOAD_FILES = int(os.environ.get("XPERT_NSJAIL_MAX_DOWNLOAD_FILES", "64"))
MAX_DOWNLOAD_BYTES = int(os.environ.get("XPERT_NSJAIL_MAX_DOWNLOAD_BYTES", str(32 * 1024 * 1024)))
MAX_READY_TEXT_BYTES = int(os.environ.get("XPERT_NSJAIL_MAX_READY_TEXT_BYTES", "4096"))
MAX_TERMINAL_BUFFER_BYTES = int(os.environ.get("XPERT_NSJAIL_MAX_TERMINAL_BUFFER_BYTES", str(4 * 1024 * 1024)))
MAX_TERMINAL_INPUT_BYTES = int(os.environ.get("XPERT_NSJAIL_MAX_TERMINAL_INPUT_BYTES", str(1024 * 1024)))
MEMORY_LIMIT_BYTES = int(os.environ.get("XPERT_NSJAIL_MEMORY_BYTES", str(2 * 1024 * 1024 * 1024)))
SWAP_LIMIT_BYTES = int(os.environ.get("XPERT_NSJAIL_SWAP_BYTES", "0"))
PIDS_LIMIT = int(os.environ.get("XPERT_NSJAIL_PIDS", "128"))
CPU_MS_PER_SECOND = int(os.environ.get("XPERT_NSJAIL_CPU_MS_PER_SEC", "1000"))
RLIMIT_AS_MB = int(os.environ.get("XPERT_NSJAIL_RLIMIT_AS_MB", "4096"))
RLIMIT_FSIZE_MB = int(os.environ.get("XPERT_NSJAIL_RLIMIT_FSIZE_MB", "256"))
RLIMIT_NOFILE = int(os.environ.get("XPERT_NSJAIL_RLIMIT_NOFILE", "256"))
JAIL_UID = int(os.environ.get("XPERT_NSJAIL_UID", "1000"))
JAIL_GID = int(os.environ.get("XPERT_NSJAIL_GID", "1000"))
CGROUP_ROOT = pathlib.Path("/sys/fs/cgroup")

RUNTIME_ID_PATTERN = re.compile(r"^[a-f0-9]{16,64}$")
SERVICE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
ENV_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
NSJAIL_CGROUP_PATTERN = re.compile(r"^NSJAIL\.[1-9][0-9]*$")
SAFE_SIGNAL_NAMES = {
    signal.SIGTERM: "SIGTERM",
    signal.SIGKILL: "SIGKILL",
    signal.SIGINT: "SIGINT",
    signal.SIGHUP: "SIGHUP",
}
BASE_ENV = {
    "HOME": "/workspace",
    "LANG": "C.UTF-8",
    "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "TERM": "xterm-256color",
}


class RunnerError(Exception):
    def __init__(self, message: str, status: int = HTTPStatus.BAD_REQUEST) -> None:
        super().__init__(message)
        self.status = status


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def is_within(root: pathlib.Path, candidate: pathlib.Path) -> bool:
    try:
        return os.path.commonpath((str(root), str(candidate))) == str(root)
    except ValueError:
        return False


def initialize_state_root() -> None:
    if STATE_ROOT != STATE_ROOT_BASE and not is_within(STATE_ROOT_BASE, STATE_ROOT):
        raise SystemExit(f"State root must be {STATE_ROOT_BASE} or one of its descendants: {STATE_ROOT}")
    if STATE_ROOT == pathlib.Path("/") or any(
        protected == STATE_ROOT or is_within(protected, STATE_ROOT) or is_within(STATE_ROOT, protected)
        for protected in (WORKSPACE_ROOT, ROOTFS)
    ):
        raise SystemExit(f"State root overlaps a protected path: {STATE_ROOT}")

    if STATE_ROOT.exists() and not STATE_ROOT.is_dir():
        raise SystemExit(f"State root is not a directory: {STATE_ROOT}")
    STATE_ROOT.mkdir(parents=True, exist_ok=True)

    marker = STATE_ROOT / STATE_MARKER_NAME
    entries = list(STATE_ROOT.iterdir())
    if entries:
        if marker.is_symlink() or not marker.is_file():
            raise SystemExit(f"Refusing to clear unmarked state root: {STATE_ROOT}")
        try:
            marker_content = marker.read_text()
        except OSError as error:
            raise SystemExit(f"Unable to validate state root marker: {error}") from error
        if not hmac.compare_digest(marker_content, STATE_MARKER_CONTENT):
            raise SystemExit(f"Refusing to clear state root with an invalid marker: {STATE_ROOT}")
    else:
        marker.write_text(STATE_MARKER_CONTENT)

    for entry in STATE_ROOT.iterdir():
        if entry == marker:
            continue
        if entry.is_symlink() or not entry.is_dir():
            entry.unlink()
        else:
            shutil.rmtree(entry)


def remove_empty_nsjail_cgroup(path: pathlib.Path, *, retries: int = 10) -> bool:
    if path.parent != CGROUP_ROOT or not NSJAIL_CGROUP_PATTERN.fullmatch(path.name):
        return False
    for attempt in range(retries):
        try:
            if (path / "cgroup.procs").read_text().strip():
                return False
            if any(entry.is_dir() for entry in path.iterdir()):
                return False
            path.rmdir()
            return True
        except FileNotFoundError:
            return True
        except OSError:
            if attempt + 1 == retries:
                return False
            time.sleep(0.02)
    return False


def process_nsjail_cgroup(process_id: int) -> pathlib.Path | None:
    try:
        lines = pathlib.Path(f"/proc/{process_id}/cgroup").read_text().splitlines()
    except OSError:
        return None
    for line in lines:
        fields = line.split(":", 2)
        if len(fields) != 3 or fields[0] != "0":
            continue
        try:
            path = (CGROUP_ROOT / fields[2].lstrip("/")).resolve()
        except OSError:
            continue
        if path.parent == CGROUP_ROOT and NSJAIL_CGROUP_PATTERN.fullmatch(path.name):
            return path
    return None


def discover_nsjail_cgroups(process_id: int, *, retries: int = 20) -> tuple[pathlib.Path, ...]:
    if not USE_CGROUP_V2:
        return ()
    for attempt in range(retries):
        paths = {
            path
            for pid in (process_id, *descendants(process_id))
            if (path := process_nsjail_cgroup(pid)) is not None
        }
        if paths:
            return tuple(sorted(paths))
        if not pathlib.Path(f"/proc/{process_id}").exists():
            return ()
        if attempt + 1 < retries:
            time.sleep(0.01)
    return ()


def cleanup_nsjail_cgroups(paths: tuple[pathlib.Path, ...]) -> bool:
    return all(remove_empty_nsjail_cgroup(path) for path in paths)


def cleanup_orphaned_nsjail_cgroups() -> int:
    if not USE_CGROUP_V2:
        return 0
    cleaned = 0
    for path in CGROUP_ROOT.glob("NSJAIL.*"):
        if remove_empty_nsjail_cgroup(path):
            cleaned += 1
    return cleaned


def ensure_startup_invariants() -> None:
    if not RUNNER_TOKEN:
        raise SystemExit("XPERT_NSJAIL_RUNNER_TOKEN is required")
    if not pathlib.Path(NSJAIL_BIN).is_file():
        raise SystemExit(f"NsJail binary not found: {NSJAIL_BIN}")
    if not ROOTFS.is_dir():
        raise SystemExit(f"NsJail rootfs not found: {ROOTFS}")
    if not WORKSPACE_ROOT.is_dir():
        raise SystemExit(f"Workspace root not found: {WORKSPACE_ROOT}")
    if not pathlib.Path(SECCOMP_POLICY).is_file():
        raise SystemExit(f"Seccomp policy not found: {SECCOMP_POLICY}")
    if RUNTIME_IDLE_TTL_SECONDS <= 0 or RUNTIME_REAPER_INTERVAL_SECONDS <= 0:
        raise SystemExit("Runtime idle TTL and reaper interval must be positive")
    if any(
        limit <= 0
        for limit in (
            MAX_SERVICE_LOG_BYTES,
            MAX_EXECUTIONS_GLOBAL,
            MAX_EXECUTIONS_PER_RUNTIME,
            MAX_DOWNLOAD_FILES,
            MAX_DOWNLOAD_BYTES,
            MAX_READY_TEXT_BYTES,
        )
    ):
        raise SystemExit("Runner concurrency, download, readiness, and log limits must be positive")
    if USE_CGROUP_V2:
        if not (CGROUP_ROOT / "cgroup.controllers").is_file():
            raise SystemExit("cgroup v2 is enabled but /sys/fs/cgroup is not a unified hierarchy")
        probe = CGROUP_ROOT / f".xpert-nsjail-probe-{os.getpid()}"
        try:
            probe.mkdir()
            probe.rmdir()
        except OSError as error:
            raise SystemExit(f"cgroup v2 is enabled but the hierarchy is not delegated: {error}") from error
        cleanup_orphaned_nsjail_cgroups()
    initialize_state_root()


def validate_workspace_path(value: Any) -> pathlib.Path:
    if not isinstance(value, str) or not value or "\x00" in value or ":" in value:
        raise RunnerError("workspacePath must be a valid absolute path")
    candidate = pathlib.Path(value)
    if not candidate.is_absolute():
        raise RunnerError("workspacePath must be absolute")
    resolved = candidate.resolve(strict=True)
    if resolved == WORKSPACE_ROOT or not is_within(WORKSPACE_ROOT, resolved):
        raise RunnerError("workspacePath is outside the configured workspace root", HTTPStatus.FORBIDDEN)
    if not resolved.is_dir():
        raise RunnerError("workspacePath is not a directory")
    return resolved


def validate_sandbox_path(value: Any, *, allow_root: bool = True) -> str:
    if not isinstance(value, str) or not value or "\x00" in value:
        raise RunnerError("Invalid sandbox path")
    path = pathlib.PurePosixPath(value)
    if path.is_absolute():
        try:
            path = path.relative_to("/workspace")
        except ValueError as error:
            raise RunnerError("Sandbox path must be inside /workspace") from error
    if any(part in ("", ".", "..") for part in path.parts):
        if path.parts not in ((), (".",)):
            raise RunnerError("Invalid sandbox path")
    relative = "/".join(part for part in path.parts if part not in ("", "."))
    if not relative and not allow_root:
        raise RunnerError("Sandbox path must identify a file")
    return relative


def validate_working_directory(value: Any) -> str:
    relative = validate_sandbox_path(value)
    return "/workspace" if not relative else f"/workspace/{relative}"


def validate_runtime_id(value: Any) -> str:
    if not isinstance(value, str) or not RUNTIME_ID_PATTERN.fullmatch(value):
        raise RunnerError("Invalid runtimeId")
    return value


def validate_service_id(value: Any) -> str:
    if not isinstance(value, str) or not SERVICE_ID_PATTERN.fullmatch(value):
        raise RunnerError("Invalid serviceId")
    return value


def validate_positive_int(value: Any, name: str, minimum: int, maximum: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum or value > maximum:
        raise RunnerError(f"{name} must be between {minimum} and {maximum}")
    return value


def descendants(process_id: int) -> list[int]:
    result: list[int] = []
    queue = [process_id]
    seen = {process_id}
    while queue:
        current = queue.pop(0)
        children_path = pathlib.Path(f"/proc/{current}/task/{current}/children")
        try:
            child_ids = [int(value) for value in children_path.read_text().split()]
        except (OSError, ValueError):
            continue
        for child_id in child_ids:
            if child_id not in seen:
                seen.add(child_id)
                result.append(child_id)
                queue.append(child_id)
    return result


def signal_process_tree(process_id: int, requested_signal: signal.Signals) -> None:
    process_ids = descendants(process_id)
    process_ids.reverse()
    process_ids.append(process_id)
    for pid in process_ids:
        try:
            os.kill(pid, requested_signal)
        except ProcessLookupError:
            continue
        except PermissionError:
            continue


def terminate_process(process: subprocess.Popen[bytes], grace_seconds: float = 5.0) -> None:
    if process.poll() is not None:
        return
    signal_process_tree(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=grace_seconds)
        return
    except subprocess.TimeoutExpired:
        signal_process_tree(process.pid, signal.SIGKILL)
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass


def decode_return_code(return_code: int | None) -> tuple[int | None, str | None]:
    if return_code is None:
        return None, None
    if return_code < 0:
        signal_number = -return_code
        try:
            signal_value = signal.Signals(signal_number)
            return None, SAFE_SIGNAL_NAMES.get(signal_value, signal_value.name)
        except ValueError:
            return None, str(signal_number)
    return return_code, None


def nsjail_args(
    runtime: Runtime,
    command: str,
    *,
    cwd: str | None = None,
    env: dict[str, str] | None = None,
    interactive: bool = False,
    time_limit_seconds: int = 0,
) -> list[str]:
    args = [
        NSJAIL_BIN,
        "--mode",
        "o",
        "--quiet",
        "--chroot",
        str(ROOTFS),
        "--cwd",
        cwd or runtime.working_directory,
        "--hostname",
        f"xpert-{runtime.runtime_id[:12]}",
        "--user",
        f"{JAIL_UID}:{JAIL_UID}:1",
        "--group",
        f"{JAIL_GID}:{JAIL_GID}:1",
        "--bindmount",
        f"{runtime.workspace_path}:/workspace",
        "--bindmount",
        "/dev/null:/dev/null",
        "--bindmount",
        "/dev/zero:/dev/zero",
        "--bindmount",
        "/dev/random:/dev/random",
        "--bindmount",
        "/dev/urandom:/dev/urandom",
        "--tmpfsmount",
        "/tmp",
        "--tmpfsmount",
        "/run",
        "--rlimit_as",
        str(RLIMIT_AS_MB),
        "--rlimit_cpu",
        "max",
        "--rlimit_fsize",
        str(RLIMIT_FSIZE_MB),
        "--rlimit_nofile",
        str(RLIMIT_NOFILE),
        "--rlimit_nproc",
        "max" if USE_CGROUP_V2 else str(PIDS_LIMIT),
        "--max_cpus",
        "2",
        "--time_limit",
        str(time_limit_seconds),
        "--seccomp_policy",
        SECCOMP_POLICY,
        "--forward_signals",
    ]
    if interactive:
        args.append("--skip_setsid")
    if USE_CGROUP_V2:
        args.extend(
            [
                "--use_cgroupv2",
                "--cgroupv2_mount",
                "/sys/fs/cgroup",
                "--cgroup_mem_max",
                str(MEMORY_LIMIT_BYTES),
                "--cgroup_mem_swap_max",
                str(SWAP_LIMIT_BYTES),
                "--cgroup_pids_max",
                str(PIDS_LIMIT),
                "--cgroup_cpu_ms_per_sec",
                str(CPU_MS_PER_SECOND),
            ]
        )
    for name, value in {**BASE_ENV, **(env or {})}.items():
        args.extend(("--env", f"{name}={value}"))
    args.extend(("--", "/bin/bash", "--noprofile", "--norc", "-c", command))
    return args


def append_limited(output: bytearray, chunk: bytes, maximum: int) -> bool:
    remaining = maximum - len(output)
    if remaining <= 0:
        return bool(chunk)
    output.extend(chunk[:remaining])
    return len(chunk) > remaining


def _execute_command(
    runtime: Runtime,
    command: str,
    timeout_ms: int,
    max_output_bytes: int,
    on_line: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    time_limit_seconds = max(1, math.ceil(timeout_ms / 1000) + 5)
    process = subprocess.Popen(
        nsjail_args(runtime, command, time_limit_seconds=time_limit_seconds),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    cgroup_paths: tuple[pathlib.Path, ...] = ()
    tracked = False
    try:
        runtime.track_process(process)
        tracked = True
        assert process.stdout is not None
        output = bytearray()
        line_buffer = bytearray()
        truncated = False
        timed_out = False
        deadline = time.monotonic() + timeout_ms / 1000
        os.set_blocking(process.stdout.fileno(), False)

        while process.poll() is None:
            if time.monotonic() >= deadline:
                timed_out = True
                cgroup_paths = discover_nsjail_cgroups(process.pid, retries=1)
                terminate_process(process)
                break
            try:
                chunk = os.read(process.stdout.fileno(), 64 * 1024)
            except BlockingIOError:
                time.sleep(0.02)
                continue
            if not chunk:
                time.sleep(0.01)
                continue
            remaining = max_output_bytes - len(output)
            accepted = chunk[: max(0, remaining)]
            truncated = append_limited(output, chunk, max_output_bytes) or truncated
            if on_line and accepted:
                line_buffer.extend(accepted)
                while b"\n" in line_buffer:
                    line, _, rest = line_buffer.partition(b"\n")
                    line_buffer = bytearray(rest)
                    on_line(line.decode("utf-8", errors="replace"))

        try:
            remainder = process.stdout.read() or b""
        except BlockingIOError:
            remainder = b""
        remaining = max_output_bytes - len(output)
        accepted = remainder[: max(0, remaining)]
        truncated = append_limited(output, remainder, max_output_bytes) or truncated
        if on_line and accepted:
            line_buffer.extend(accepted)
            while b"\n" in line_buffer:
                line, _, rest = line_buffer.partition(b"\n")
                line_buffer = bytearray(rest)
                on_line(line.decode("utf-8", errors="replace"))
        if on_line and line_buffer:
            on_line(line_buffer.decode("utf-8", errors="replace"))

        if timed_out:
            message = f"Command timed out after {timeout_ms / 1000:g}s ({timeout_ms}ms)".encode()
            if output:
                message = b"\n" + message
            truncated = append_limited(output, message, max_output_bytes) or truncated
            exit_code = None
        else:
            process.wait()
            exit_code, _ = decode_return_code(process.returncode)

        return {
            "exitCode": exit_code,
            "output": output.decode("utf-8", errors="replace"),
            "timedOut": timed_out,
            "truncated": truncated,
        }
    finally:
        if process.poll() is None:
            terminate_process(process)
        cleanup_nsjail_cgroups(cgroup_paths)
        if tracked:
            runtime.untrack_process(process)


ACTIVE_EXECUTIONS_GLOBAL = 0
EXECUTIONS_LOCK = threading.RLock()


@contextmanager
def execution_slot(runtime: Runtime) -> Iterator[None]:
    global ACTIVE_EXECUTIONS_GLOBAL
    with EXECUTIONS_LOCK:
        with runtime.lock:
            runtime.ensure_active()
            if ACTIVE_EXECUTIONS_GLOBAL >= MAX_EXECUTIONS_GLOBAL:
                raise RunnerError("NsJail Runner execution limit reached", HTTPStatus.TOO_MANY_REQUESTS)
            if runtime.active_executions >= MAX_EXECUTIONS_PER_RUNTIME:
                raise RunnerError("NsJail runtime execution limit reached", HTTPStatus.TOO_MANY_REQUESTS)
            ACTIVE_EXECUTIONS_GLOBAL += 1
            runtime.active_executions += 1
            runtime.last_activity_at = time.monotonic()
    try:
        yield
    finally:
        with EXECUTIONS_LOCK:
            with runtime.lock:
                ACTIVE_EXECUTIONS_GLOBAL = max(0, ACTIVE_EXECUTIONS_GLOBAL - 1)
                runtime.active_executions = max(0, runtime.active_executions - 1)
                runtime.last_activity_at = time.monotonic()


def execute_command(
    runtime: Runtime,
    command: str,
    timeout_ms: int,
    max_output_bytes: int,
    on_line: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    with execution_slot(runtime):
        return _execute_command(runtime, command, timeout_ms, max_output_bytes, on_line)


def workspace_parts(path_value: Any, *, allow_root: bool = False) -> list[str]:
    relative = validate_sandbox_path(path_value, allow_root=allow_root)
    return [part for part in relative.split("/") if part]


def open_parent_dir(runtime: Runtime, parts: list[str], *, create: bool) -> tuple[int, str]:
    if not parts:
        raise RunnerError("Sandbox path must identify a file")
    current_fd = os.open(runtime.workspace_path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in parts[:-1]:
            created = False
            try:
                next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current_fd)
            except FileNotFoundError:
                if not create:
                    raise
                try:
                    os.mkdir(part, mode=0o755, dir_fd=current_fd)
                    created = True
                except FileExistsError:
                    pass
                next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current_fd)
            if created:
                try:
                    os.fchown(next_fd, JAIL_UID, JAIL_GID)
                    os.fchmod(next_fd, 0o755)
                except Exception:
                    os.close(next_fd)
                    try:
                        os.rmdir(part, dir_fd=current_fd)
                    except OSError:
                        pass
                    raise
            os.close(current_fd)
            current_fd = next_fd
        return current_fd, parts[-1]
    except Exception:
        os.close(current_fd)
        raise


def file_error(error: OSError) -> str:
    if error.errno == errno.ENOENT:
        return "file_not_found"
    if error.errno in (errno.EACCES, errno.EPERM):
        return "permission_denied"
    if error.errno in (errno.EISDIR, errno.ENOTDIR):
        return "is_directory"
    return "invalid_path"


def upload_file(runtime: Runtime, path_value: Any, content_value: Any) -> dict[str, Any]:
    original_path = str(path_value)
    try:
        parts = workspace_parts(path_value)
        if not isinstance(content_value, str):
            raise RunnerError("File content must be base64 encoded")
        content = base64.b64decode(content_value, validate=True)
        if len(content) > MAX_FILE_BYTES:
            raise RunnerError("File exceeds the Runner file size limit")
        parent_fd, filename = open_parent_dir(runtime, parts, create=True)
        try:
            created = False
            try:
                file_fd = os.open(
                    filename,
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                    0o644,
                    dir_fd=parent_fd,
                )
                created = True
            except FileExistsError:
                file_fd = os.open(filename, os.O_WRONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
            try:
                file_stat = os.fstat(file_fd)
                if not stat.S_ISREG(file_stat.st_mode) or file_stat.st_nlink != 1:
                    raise OSError(errno.EPERM, "Refusing to write through a non-regular or linked file")
                if created:
                    try:
                        os.fchown(file_fd, JAIL_UID, JAIL_GID)
                        os.fchmod(file_fd, 0o644)
                    except Exception:
                        os.close(file_fd)
                        file_fd = -1
                        try:
                            os.unlink(filename, dir_fd=parent_fd)
                        except OSError:
                            pass
                        raise
                os.ftruncate(file_fd, 0)
                with os.fdopen(file_fd, "wb", closefd=False) as target:
                    target.write(content)
            finally:
                if file_fd >= 0:
                    os.close(file_fd)
        finally:
            os.close(parent_fd)
        return {"error": None, "path": original_path}
    except RunnerError:
        return {"error": "invalid_path", "path": original_path}
    except (OSError, binascii.Error) as error:
        return {"error": file_error(error) if isinstance(error, OSError) else "invalid_path", "path": original_path}


def read_file_content(runtime: Runtime, path_value: Any) -> bytes:
    parts = workspace_parts(path_value)
    parent_fd, filename = open_parent_dir(runtime, parts, create=False)
    try:
        file_fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
        try:
            file_stat = os.fstat(file_fd)
            if not stat.S_ISREG(file_stat.st_mode) or file_stat.st_nlink != 1:
                raise IsADirectoryError(filename)
            if file_stat.st_size > MAX_FILE_BYTES:
                raise RunnerError("File exceeds the Runner file size limit")
            content = bytearray()
            while True:
                chunk = os.read(file_fd, min(64 * 1024, MAX_FILE_BYTES + 1 - len(content)))
                if not chunk:
                    break
                content.extend(chunk)
                if len(content) > MAX_FILE_BYTES:
                    raise RunnerError("File exceeds the Runner file size limit")
        finally:
            os.close(file_fd)
    finally:
        os.close(parent_fd)
    return bytes(content)


def download_files(runtime: Runtime, paths: list[Any]) -> list[dict[str, Any]]:
    if len(paths) > MAX_DOWNLOAD_FILES:
        raise RunnerError("File download count exceeds the Runner limit", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
    total_bytes = 0
    pending: list[tuple[str, bytes | None, str | None]] = []
    for path_value in paths:
        original_path = str(path_value)
        try:
            content = read_file_content(runtime, path_value)
            total_bytes += len(content)
            if total_bytes > MAX_DOWNLOAD_BYTES:
                raise RunnerError(
                    "File download size exceeds the Runner aggregate limit",
                    HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                )
            pending.append((original_path, content, None))
        except RunnerError as error:
            if error.status == HTTPStatus.REQUEST_ENTITY_TOO_LARGE:
                raise
            pending.append((original_path, None, "invalid_path"))
        except OSError as error:
            pending.append((original_path, None, file_error(error)))
    return [
        {
            "contentBase64": base64.b64encode(content).decode() if content is not None else None,
            "error": error,
            "path": path,
        }
        for path, content, error in pending
    ]


def download_file(runtime: Runtime, path_value: Any) -> dict[str, Any]:
    return download_files(runtime, [path_value])[0]


def copy_bounded_log(source: BinaryIO, path: pathlib.Path) -> None:
    try:
        with source, path.open("wb", buffering=0) as target:
            bytes_written = 0
            read_chunk = getattr(source, "read1", source.read)
            while True:
                chunk = read_chunk(64 * 1024)
                if not chunk:
                    return
                if len(chunk) >= MAX_SERVICE_LOG_BYTES:
                    chunk = chunk[-MAX_SERVICE_LOG_BYTES:]
                    target.seek(0)
                    target.truncate()
                    bytes_written = 0
                elif bytes_written + len(chunk) > MAX_SERVICE_LOG_BYTES:
                    target.seek(0)
                    target.truncate()
                    bytes_written = 0
                target.write(chunk)
                bytes_written += len(chunk)
    except OSError:
        return


@dataclass
class Terminal:
    terminal_id: str
    pid: int
    master_fd: int
    cgroup_paths: tuple[pathlib.Path, ...] = ()
    output: bytearray = field(default_factory=bytearray)
    exited: bool = False
    exit_code: int | None = None
    signal_number: int | None = None
    condition: threading.Condition = field(default_factory=threading.Condition)

    def start_reader(self) -> None:
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        try:
            while True:
                try:
                    chunk = os.read(self.master_fd, 64 * 1024)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                if not chunk:
                    break
                with self.condition:
                    self.output.extend(chunk)
                    overflow = len(self.output) - MAX_TERMINAL_BUFFER_BYTES
                    if overflow > 0:
                        del self.output[:overflow]
                    self.condition.notify_all()
        finally:
            try:
                _, wait_status = os.waitpid(self.pid, 0)
                return_code = os.waitstatus_to_exitcode(wait_status)
            except ChildProcessError:
                return_code = 0
            with self.condition:
                self.exited = True
                if return_code < 0:
                    self.signal_number = -return_code
                else:
                    self.exit_code = return_code
                self.condition.notify_all()
            try:
                os.close(self.master_fd)
            except OSError:
                pass
            cleanup_nsjail_cgroups(self.cgroup_paths)

    def drain(self) -> dict[str, Any]:
        with self.condition:
            if not self.output and not self.exited:
                self.condition.wait(timeout=20)
            output = bytes(self.output)
            self.output.clear()
            return {
                "exitCode": self.exit_code,
                "exited": self.exited,
                "output": output.decode("utf-8", errors="replace"),
                "signal": self.signal_number,
            }

    def close(self) -> None:
        if self.exited:
            return
        self.cgroup_paths = tuple(
            sorted(set(self.cgroup_paths).union(discover_nsjail_cgroups(self.pid, retries=1)))
        )
        signal_process_tree(self.pid, signal.SIGTERM)
        time.sleep(0.2)
        if not self.exited:
            signal_process_tree(self.pid, signal.SIGKILL)


@dataclass
class Service:
    service_id: str
    process: subprocess.Popen[bytes]
    stdout_path: pathlib.Path
    stderr_path: pathlib.Path
    actual_port: int | None
    started_at: str
    cgroup_paths: tuple[pathlib.Path, ...] = ()
    log_threads: tuple[threading.Thread, ...] = ()
    status: str = "starting"
    stopped_at: str | None = None
    exit_code: int | None = None
    signal_name: str | None = None
    cgroup_cleaned: bool = False

    def wait_for_logs(self) -> None:
        for thread in self.log_threads:
            thread.join(timeout=1)

    def refresh(self) -> None:
        return_code = self.process.poll()
        if return_code is None:
            return
        self.wait_for_logs()
        if not self.cgroup_cleaned:
            self.cgroup_cleaned = cleanup_nsjail_cgroups(self.cgroup_paths)
        if self.status not in ("stopped", "failed"):
            self.exit_code, self.signal_name = decode_return_code(return_code)
            self.status = "stopped" if return_code == 0 or self.status == "stopping" else "failed"
            self.stopped_at = self.stopped_at or utc_now()

    def state(self) -> dict[str, Any]:
        self.refresh()
        return {
            "actualPort": self.actual_port,
            "exitCode": self.exit_code,
            "serviceId": self.service_id,
            "signal": self.signal_name,
            "startedAt": self.started_at,
            "status": self.status,
            "stoppedAt": self.stopped_at,
            "transportMode": "http" if self.actual_port else "none",
        }

    def stop(self) -> None:
        self.refresh()
        if self.process.poll() is None:
            self.cgroup_paths = tuple(
                sorted(set(self.cgroup_paths).union(discover_nsjail_cgroups(self.process.pid, retries=1)))
            )
            self.status = "stopping"
            terminate_process(self.process)
        self.refresh()
        if self.status == "stopping":
            self.status = "stopped"
            self.stopped_at = utc_now()
        self.wait_for_logs()


@dataclass
class Runtime:
    runtime_id: str
    workspace_path: pathlib.Path
    working_directory: str
    services: dict[str, Service] = field(default_factory=dict)
    starting_service_ids: set[str] = field(default_factory=set)
    starting_terminal_ids: set[str] = field(default_factory=set)
    terminals: dict[str, Terminal] = field(default_factory=dict)
    active_processes: set[subprocess.Popen[bytes]] = field(default_factory=set)
    active_executions: int = 0
    last_activity_at: float = field(default_factory=time.monotonic)
    destroyed: bool = False
    lock: threading.RLock = field(default_factory=threading.RLock)

    def ensure_active(self) -> None:
        with self.lock:
            if self.destroyed:
                raise RunnerError("NsJail runtime not found", HTTPStatus.NOT_FOUND)

    def touch(self) -> None:
        with self.lock:
            self.ensure_active()
            self.last_activity_at = time.monotonic()

    def track_process(self, process: subprocess.Popen[bytes]) -> None:
        with self.lock:
            if self.destroyed:
                raise RunnerError("NsJail runtime not found", HTTPStatus.NOT_FOUND)
            self.last_activity_at = time.monotonic()
            self.active_processes.add(process)

    def untrack_process(self, process: subprocess.Popen[bytes]) -> None:
        with self.lock:
            self.active_processes.discard(process)
            self.last_activity_at = time.monotonic()

    def is_idle_expired(self, now: float, idle_ttl_seconds: int) -> bool:
        with self.lock:
            if self.destroyed or now - self.last_activity_at < idle_ttl_seconds:
                return False
            if self.starting_service_ids:
                return False
            if self.starting_terminal_ids or self.active_executions:
                return False
            if any(process.poll() is None for process in self.active_processes):
                return False
            return not any(service.process.poll() is None for service in self.services.values())

    def destroy(self) -> None:
        with self.lock:
            if self.destroyed:
                return
            self.destroyed = True
            terminals = list(self.terminals.values())
            services = list(self.services.values())
            processes = list(self.active_processes)
            self.starting_service_ids.clear()
            self.starting_terminal_ids.clear()
            self.terminals.clear()
            self.services.clear()
            self.active_processes.clear()
        for process in processes:
            terminate_process(process)
        for terminal in terminals:
            terminal.close()
        for service in services:
            service.stop()
        shutil.rmtree(STATE_ROOT / self.runtime_id, ignore_errors=True)
        cleanup_orphaned_nsjail_cgroups()


RUNTIMES: dict[str, Runtime] = {}
RUNTIMES_LOCK = threading.RLock()


def get_runtime(runtime_id: str) -> Runtime:
    with RUNTIMES_LOCK:
        runtime = RUNTIMES.get(validate_runtime_id(runtime_id))
        if runtime:
            runtime.touch()
    if not runtime:
        raise RunnerError("NsJail runtime not found", HTTPStatus.NOT_FOUND)
    return runtime


def create_runtime(payload: Any) -> Runtime:
    if not isinstance(payload, dict):
        raise RunnerError("Invalid runtime request")
    runtime_id = validate_runtime_id(payload.get("runtimeId"))
    workspace_path = validate_workspace_path(payload.get("workspacePath"))
    working_directory = validate_working_directory(payload.get("workingDirectory"))
    relative_working_directory = validate_sandbox_path(working_directory)
    host_working_directory = workspace_path.joinpath(*relative_working_directory.split("/"))
    if not host_working_directory.is_dir():
        raise RunnerError("workingDirectory does not exist in the workspace")

    with RUNTIMES_LOCK:
        existing = RUNTIMES.get(runtime_id)
        if existing:
            if existing.workspace_path != workspace_path or existing.working_directory != working_directory:
                raise RunnerError("runtimeId is already bound to a different workspace", HTTPStatus.CONFLICT)
            existing.touch()
            return existing
        if len(RUNTIMES) >= MAX_RUNTIMES:
            raise RunnerError("NsJail Runner runtime limit reached", HTTPStatus.TOO_MANY_REQUESTS)
        runtime = Runtime(runtime_id, workspace_path, working_directory)
        RUNTIMES[runtime_id] = runtime
        return runtime


def reap_idle_runtimes(
    *,
    now: float | None = None,
    idle_ttl_seconds: int = RUNTIME_IDLE_TTL_SECONDS,
) -> int:
    current_time = time.monotonic() if now is None else now
    expired: list[Runtime] = []
    with RUNTIMES_LOCK:
        for runtime_id, runtime in list(RUNTIMES.items()):
            if runtime.is_idle_expired(current_time, idle_ttl_seconds):
                RUNTIMES.pop(runtime_id, None)
                expired.append(runtime)
    for runtime in expired:
        runtime.destroy()
    return len(expired)


def runtime_reaper(stop_event: threading.Event) -> None:
    while not stop_event.wait(RUNTIME_REAPER_INTERVAL_SECONDS):
        reaped = reap_idle_runtimes()
        if reaped:
            print(f"[nsjail-runner] reaped {reaped} idle runtime(s)", flush=True)


def open_terminal(runtime: Runtime, payload: Any) -> Terminal:
    if not isinstance(payload, dict):
        raise RunnerError("Invalid terminal request")
    cols = validate_positive_int(payload.get("cols"), "cols", 1, 1000)
    rows = validate_positive_int(payload.get("rows"), "rows", 1, 1000)
    terminal_id = uuid.uuid4().hex
    with runtime.lock:
        runtime.ensure_active()
        if len(runtime.terminals) + len(runtime.starting_terminal_ids) >= MAX_TERMINALS_PER_RUNTIME:
            raise RunnerError("NsJail runtime terminal limit reached", HTTPStatus.TOO_MANY_REQUESTS)
        runtime.starting_terminal_ids.add(terminal_id)
        runtime.last_activity_at = time.monotonic()

    terminal: Terminal | None = None
    pid: int | None = None
    master_fd: int | None = None
    try:
        pid, master_fd = pty.fork()
        if pid == 0:
            try:
                os.execv(
                    NSJAIL_BIN,
                    nsjail_args(
                        runtime,
                        "exec /bin/bash --noprofile --norc -i",
                        interactive=True,
                        time_limit_seconds=0,
                    ),
                )
            finally:
                os._exit(127)
        terminal = Terminal(terminal_id, pid, master_fd, discover_nsjail_cgroups(pid))
        terminal.start_reader()
        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
        with runtime.lock:
            runtime.starting_terminal_ids.discard(terminal_id)
            if runtime.destroyed:
                raise RunnerError("NsJail runtime not found", HTTPStatus.NOT_FOUND)
            runtime.terminals[terminal_id] = terminal
            runtime.last_activity_at = time.monotonic()
        return terminal
    except Exception:
        with runtime.lock:
            runtime.starting_terminal_ids.discard(terminal_id)
        if terminal:
            terminal.close()
        elif pid is not None and pid > 0:
            signal_process_tree(pid, signal.SIGKILL)
            try:
                os.waitpid(pid, 0)
            except ChildProcessError:
                pass
            if master_fd is not None:
                try:
                    os.close(master_fd)
                except OSError:
                    pass
        raise


def terminal_for(runtime: Runtime, terminal_id: str) -> Terminal:
    terminal = runtime.terminals.get(terminal_id)
    if not terminal:
        raise RunnerError("Terminal session not found", HTTPStatus.NOT_FOUND)
    return terminal


def drain_terminal_event(runtime: Runtime, terminal: Terminal) -> dict[str, Any]:
    event = terminal.drain()
    if event["exited"]:
        with runtime.lock:
            if runtime.terminals.get(terminal.terminal_id) is terminal:
                runtime.terminals.pop(terminal.terminal_id, None)
    return event


def normalize_service_env(value: Any) -> dict[str, str]:
    if value is None:
        return {}
    if not isinstance(value, list) or len(value) > 64:
        raise RunnerError("Invalid service environment")
    result: dict[str, str] = {}
    for entry in value:
        if not isinstance(entry, dict):
            raise RunnerError("Invalid service environment entry")
        name = entry.get("name")
        env_value = entry.get("value")
        if not isinstance(name, str) or not ENV_NAME_PATTERN.fullmatch(name):
            raise RunnerError("Invalid service environment variable name")
        if not isinstance(env_value, str) or len(env_value) > 16 * 1024:
            raise RunnerError("Invalid service environment variable value")
        result[name] = env_value
    return result


def namespace_pid(process_id: int) -> int | None:
    candidates = descendants(process_id)
    return candidates[-1] if candidates else None


def probe_port(process_id: int, port: int) -> bool:
    target_pid = namespace_pid(process_id)
    if not target_pid:
        return False
    probe = subprocess.run(
        [
            "nsenter",
            "--target",
            str(target_pid),
            "--net",
            "--",
            "python3",
            "-c",
            "import socket,sys;s=socket.socket();s.settimeout(.25);sys.exit(s.connect_ex(('127.0.0.1',int(sys.argv[1]))))",
            str(port),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=2,
        check=False,
    )
    return probe.returncode == 0


def logs_match(service: Service, ready_text: str) -> bool:
    needle = ready_text.encode()
    for log_path in (service.stdout_path, service.stderr_path):
        try:
            with log_path.open("rb") as log_file:
                log_file.seek(0, os.SEEK_END)
                size = log_file.tell()
                log_file.seek(max(0, size - min(MAX_LOG_READ_BYTES, 1024 * 1024)))
                content = log_file.read()
        except OSError:
            continue
        if needle in content:
            return True
    return False


def cleanup_service_files(service: Service) -> None:
    service.wait_for_logs()
    shutil.rmtree(service.stdout_path.parent, ignore_errors=True)


def remove_service(runtime: Runtime, service: Service, *, stop: bool = True) -> dict[str, Any]:
    if stop:
        service.stop()
    else:
        service.refresh()
    state = service.state()
    with runtime.lock:
        if runtime.services.get(service.service_id) is service:
            cleanup_service_files(service)
            runtime.services.pop(service.service_id, None)
        runtime.last_activity_at = time.monotonic()
    return state


def prune_finished_services(runtime: Runtime) -> int:
    pruned = 0
    with runtime.lock:
        for service_id, service in list(runtime.services.items()):
            if service.process.poll() is not None and runtime.services.get(service_id) is service:
                service.refresh()
                cleanup_service_files(service)
                runtime.services.pop(service_id, None)
                pruned += 1
    return pruned


def list_service_states(runtime: Runtime) -> list[dict[str, Any]]:
    with runtime.lock:
        services = list(runtime.services.values())
    states = [service.state() for service in services]
    prune_finished_services(runtime)
    return states


def reserve_service_start(runtime: Runtime, service_id: str) -> None:
    prune_finished_services(runtime)
    with runtime.lock:
        runtime.ensure_active()
        if service_id in runtime.starting_service_ids:
            raise RunnerError("Service is already starting", HTTPStatus.CONFLICT)
        existing = runtime.services.get(service_id)
        if existing:
            existing.refresh()
            if existing.process.poll() is None:
                raise RunnerError("Service is already running", HTTPStatus.CONFLICT)
        active_service_count = sum(service.process.poll() is None for service in runtime.services.values())
        if active_service_count + len(runtime.starting_service_ids) >= MAX_SERVICES_PER_RUNTIME:
            raise RunnerError("NsJail runtime service limit reached", HTTPStatus.TOO_MANY_REQUESTS)
        runtime.starting_service_ids.add(service_id)
        runtime.last_activity_at = time.monotonic()


def prepare_service_logs(runtime: Runtime, service_id: str) -> tuple[pathlib.Path, pathlib.Path]:
    service_root = STATE_ROOT / runtime.runtime_id / "services" / service_id
    shutil.rmtree(service_root, ignore_errors=True)
    service_root.mkdir(parents=True, exist_ok=True)
    stdout_path = service_root / "stdout.log"
    stderr_path = service_root / "stderr.log"
    stdout_path.touch()
    stderr_path.touch()
    return stdout_path, stderr_path


def start_service_log_threads(
    process: subprocess.Popen[bytes],
    stdout_path: pathlib.Path,
    stderr_path: pathlib.Path,
) -> tuple[threading.Thread, threading.Thread]:
    assert process.stdout is not None and process.stderr is not None
    threads = (
        threading.Thread(target=copy_bounded_log, args=(process.stdout, stdout_path), daemon=True),
        threading.Thread(target=copy_bounded_log, args=(process.stderr, stderr_path), daemon=True),
    )
    for thread in threads:
        thread.start()
    return threads


def start_service(runtime: Runtime, payload: Any) -> Service:
    if not isinstance(payload, dict):
        raise RunnerError("Invalid service request")
    service_id = validate_service_id(payload.get("serviceId"))
    command = payload.get("command")
    if not isinstance(command, str) or not command.strip() or len(command) > 256 * 1024:
        raise RunnerError("Invalid service command")
    cwd = validate_working_directory(payload.get("cwd"))
    port_value = payload.get("port")
    port = None if port_value is None else validate_positive_int(port_value, "port", 1, 65535)
    ready_pattern_value = payload.get("readyPattern")
    if ready_pattern_value is not None and not isinstance(ready_pattern_value, str):
        raise RunnerError("Invalid readyPattern")
    ready_text = ready_pattern_value or None
    if ready_text and len(ready_text.encode()) > MAX_READY_TEXT_BYTES:
        raise RunnerError("readyPattern exceeds the Runner literal text limit")
    env = normalize_service_env(payload.get("env"))

    reserve_service_start(runtime, service_id)

    stdout_path: pathlib.Path | None = None
    stderr_path: pathlib.Path | None = None
    process: subprocess.Popen[bytes] | None = None
    service: Service | None = None
    log_threads: tuple[threading.Thread, ...] = ()
    try:
        stdout_path, stderr_path = prepare_service_logs(runtime, service_id)
        process = subprocess.Popen(
            nsjail_args(runtime, command, cwd=cwd, env=env, time_limit_seconds=0),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
        log_threads = start_service_log_threads(process, stdout_path, stderr_path)
        service = Service(
            service_id,
            process,
            stdout_path,
            stderr_path,
            port,
            utc_now(),
            discover_nsjail_cgroups(process.pid),
            log_threads,
        )
        with runtime.lock:
            if runtime.destroyed:
                raise RunnerError("NsJail runtime not found", HTTPStatus.NOT_FOUND)
            runtime.services[service_id] = service
            runtime.starting_service_ids.discard(service_id)
            runtime.last_activity_at = time.monotonic()
    except Exception:
        with runtime.lock:
            runtime.starting_service_ids.discard(service_id)
        if process and process.poll() is None:
            terminate_process(process)
        for thread in log_threads:
            thread.join(timeout=1)
        if stdout_path:
            shutil.rmtree(stdout_path.parent, ignore_errors=True)
        raise

    try:
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            assert service is not None
            service.refresh()
            if service.process.poll() is not None:
                raise RunnerError("Managed service exited before becoming ready")
            if port and probe_port(service.process.pid, port):
                service.status = "running"
                return service
            if ready_text and logs_match(service, ready_text):
                service.status = "running"
                return service
            if not port and not ready_text:
                time.sleep(0.3)
                service.status = "running"
                return service
            time.sleep(0.1)
        raise RunnerError("Managed service did not become ready within 30 seconds")
    except Exception:
        assert service is not None
        remove_service(runtime, service)
        raise


def tail_file(path: pathlib.Path, line_count: int) -> str:
    try:
        with path.open("rb") as log_file:
            log_file.seek(0, os.SEEK_END)
            position = log_file.tell()
            chunks: list[bytes] = []
            bytes_read = 0
            newline_count = 0
            while position > 0 and bytes_read < MAX_LOG_READ_BYTES and newline_count <= line_count:
                chunk_size = min(64 * 1024, position, MAX_LOG_READ_BYTES - bytes_read)
                position -= chunk_size
                log_file.seek(position)
                chunk = log_file.read(chunk_size)
                chunks.append(chunk)
                bytes_read += len(chunk)
                newline_count += chunk.count(b"\n")
    except OSError:
        return ""
    lines = b"".join(reversed(chunks)).decode("utf-8", errors="replace").splitlines()
    return "\n".join(lines[-line_count:])


class RunnerHandler(BaseHTTPRequestHandler):
    server_version = "XpertNsJailRunner/1"
    protocol_version = "HTTP/1.0"

    def log_message(self, format_string: str, *args: Any) -> None:
        print(f"[nsjail-runner] {self.address_string()} {format_string % args}", flush=True)

    def do_GET(self) -> None:
        self._dispatch("GET")

    def do_POST(self) -> None:
        self._dispatch("POST")

    def do_DELETE(self) -> None:
        self._dispatch("DELETE")

    def _dispatch(self, method: str) -> None:
        try:
            parsed = urlsplit(self.path)
            parts = [unquote(part) for part in parsed.path.strip("/").split("/") if part]
            if parts == ["health"] and method == "GET":
                self._authorize()
                self._write_json({"status": "ok"})
                return
            self._authorize()
            payload = self._read_json() if method == "POST" else None

            if parts == ["v1", "runtimes"] and method == "POST":
                runtime = create_runtime(payload)
                self._write_json({"runtimeId": runtime.runtime_id}, HTTPStatus.CREATED)
                return
            if len(parts) >= 3 and parts[:2] == ["v1", "runtimes"]:
                runtime = get_runtime(parts[2])
                self._handle_runtime(method, runtime, parts[3:], parsed.query, payload)
                return
            raise RunnerError("Route not found", HTTPStatus.NOT_FOUND)
        except RunnerError as error:
            self._write_json({"error": str(error)}, error.status)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as error:
            print(f"[nsjail-runner] unhandled error: {error!r}", flush=True)
            self._write_json({"error": "NsJail Runner internal error"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def _handle_runtime(
        self,
        method: str,
        runtime: Runtime,
        parts: list[str],
        query: str,
        payload: Any,
    ) -> None:
        if not parts and method == "DELETE":
            with RUNTIMES_LOCK:
                RUNTIMES.pop(runtime.runtime_id, None)
            runtime.destroy()
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return
        runtime.ensure_active()
        if parts == ["exec"] and method == "POST":
            command, timeout_ms, max_output_bytes = self._execution_request(payload)
            self._write_json(execute_command(runtime, command, timeout_ms, max_output_bytes))
            return
        if parts == ["exec", "stream"] and method == "POST":
            command, timeout_ms, max_output_bytes = self._execution_request(payload)
            self.send_response(HTTPStatus.OK)
            self.send_header("content-type", "application/x-ndjson")
            self.send_header("cache-control", "no-store")
            self.end_headers()

            def on_line(line: str) -> None:
                self.wfile.write((json.dumps({"data": line, "type": "line"}) + "\n").encode())
                self.wfile.flush()

            result = execute_command(runtime, command, timeout_ms, max_output_bytes, on_line)
            self.wfile.write((json.dumps({"result": result, "type": "result"}) + "\n").encode())
            self.wfile.flush()
            return
        if parts == ["files", "upload"] and method == "POST":
            if not isinstance(payload, dict) or not isinstance(payload.get("files"), list):
                raise RunnerError("Invalid upload request")
            self._write_json(
                [upload_file(runtime, entry.get("path"), entry.get("contentBase64")) if isinstance(entry, dict) else {"error": "invalid_path", "path": ""} for entry in payload["files"]]
            )
            return
        if parts == ["files", "download"] and method == "POST":
            if not isinstance(payload, dict) or not isinstance(payload.get("paths"), list):
                raise RunnerError("Invalid download request")
            self._write_json(download_files(runtime, payload["paths"]))
            return
        if parts == ["terminals"] and method == "POST":
            terminal = open_terminal(runtime, payload)
            self._write_json({"terminalId": terminal.terminal_id}, HTTPStatus.CREATED)
            return
        if len(parts) >= 2 and parts[0] == "terminals":
            terminal = terminal_for(runtime, parts[1])
            if parts[2:] == ["events"] and method == "GET":
                self._write_json(drain_terminal_event(runtime, terminal))
                return
            if parts[2:] == ["input"] and method == "POST":
                if not isinstance(payload, dict) or not isinstance(payload.get("data"), str):
                    raise RunnerError("Invalid terminal input")
                terminal_input = payload["data"].encode()
                if len(terminal_input) > MAX_TERMINAL_INPUT_BYTES:
                    raise RunnerError("Terminal input exceeds the Runner limit", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
                os.write(terminal.master_fd, terminal_input)
                self._write_json({"status": "ok"})
                return
            if parts[2:] == ["resize"] and method == "POST":
                if not isinstance(payload, dict):
                    raise RunnerError("Invalid terminal resize request")
                cols = validate_positive_int(payload.get("cols"), "cols", 1, 1000)
                rows = validate_positive_int(payload.get("rows"), "rows", 1, 1000)
                fcntl.ioctl(terminal.master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
                self._write_json({"status": "ok"})
                return
            if len(parts) == 2 and method == "DELETE":
                terminal.close()
                runtime.terminals.pop(terminal.terminal_id, None)
                self.send_response(HTTPStatus.NO_CONTENT)
                self.end_headers()
                return
        if parts == ["services"] and method == "POST":
            self._write_json(start_service(runtime, payload).state(), HTTPStatus.CREATED)
            return
        if parts == ["services"] and method == "GET":
            self._write_json(list_service_states(runtime))
            return
        if len(parts) >= 2 and parts[0] == "services":
            service_id = validate_service_id(parts[1])
            with runtime.lock:
                service = runtime.services.get(service_id)
            if not service:
                raise RunnerError("Managed service not found", HTTPStatus.NOT_FOUND)
            if parts[2:] == ["logs"] and method == "GET":
                tail_value = parse_qs(query).get("tail", ["200"])[0]
                try:
                    tail = max(1, min(10_000, int(tail_value)))
                except ValueError as error:
                    raise RunnerError("Invalid log tail") from error
                self._write_json({"stderr": tail_file(service.stderr_path, tail), "stdout": tail_file(service.stdout_path, tail)})
                return
            if parts[2:] == ["proxy"] and method == "POST":
                self._proxy_service(service, payload)
                return
            if len(parts) == 2 and method == "DELETE":
                self._write_json(remove_service(runtime, service))
                return
        raise RunnerError("Route not found", HTTPStatus.NOT_FOUND)

    def _execution_request(self, payload: Any) -> tuple[str, int, int]:
        if not isinstance(payload, dict):
            raise RunnerError("Invalid execution request")
        command = payload.get("command")
        if not isinstance(command, str) or not command.strip() or len(command) > 1024 * 1024:
            raise RunnerError("Invalid command")
        timeout_ms = validate_positive_int(payload.get("timeoutMs"), "timeoutMs", 1, 3_600_000)
        max_output_bytes = validate_positive_int(
            payload.get("maxOutputBytes"), "maxOutputBytes", 1, 16 * 1024 * 1024
        )
        return command, timeout_ms, max_output_bytes

    def _proxy_service(self, service: Service, payload: Any) -> None:
        service.refresh()
        if service.status != "running" or not service.actual_port or service.process.poll() is not None:
            raise RunnerError("Managed service is not running", HTTPStatus.BAD_GATEWAY)
        target_pid = namespace_pid(service.process.pid)
        if not target_pid:
            raise RunnerError("Managed service network namespace is unavailable", HTTPStatus.BAD_GATEWAY)
        if not isinstance(payload, dict):
            raise RunnerError("Invalid service proxy request")
        proxy_payload = {
            "bodyBase64": payload.get("bodyBase64", ""),
            "headers": payload.get("headers", {}),
            "method": payload.get("method", "GET"),
            "path": payload.get("path", "/"),
            "port": service.actual_port,
        }
        process = subprocess.Popen(
            [
                "nsenter",
                "--target",
                str(target_pid),
                "--net",
                "--",
                "python3",
                "/app/net_proxy.py",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        assert process.stdin is not None and process.stdout is not None
        process.stdin.write(json.dumps(proxy_payload).encode())
        process.stdin.close()
        header_line = process.stdout.readline()
        if not header_line:
            error_output = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
            terminate_process(process, 0.5)
            raise RunnerError(error_output or "Managed service proxy failed", HTTPStatus.BAD_GATEWAY)
        try:
            proxy_head = json.loads(header_line)
            if "error" in proxy_head:
                raise RunnerError(str(proxy_head["error"]), HTTPStatus.BAD_GATEWAY)
            status = int(proxy_head["status"])
            headers = proxy_head["headers"]
            if not isinstance(headers, list):
                raise ValueError("headers")
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            terminate_process(process, 0.5)
            raise RunnerError("Managed service proxy returned invalid headers", HTTPStatus.BAD_GATEWAY) from error

        self.send_response(status)
        for entry in headers:
            if isinstance(entry, list) and len(entry) == 2:
                self.send_header(str(entry[0]), str(entry[1]))
        self.end_headers()
        try:
            while True:
                chunk = process.stdout.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        finally:
            terminate_process(process, 0.5)

    def _authorize(self) -> None:
        authorization = self.headers.get("authorization", "")
        if not hmac.compare_digest(authorization, f"Bearer {RUNNER_TOKEN}"):
            raise RunnerError("Unauthorized", HTTPStatus.UNAUTHORIZED)

    def _read_json(self) -> Any:
        content_length = self.headers.get("content-length")
        try:
            size = int(content_length or "0")
        except ValueError as error:
            raise RunnerError("Invalid content-length") from error
        if size < 0 or size > MAX_REQUEST_BYTES:
            raise RunnerError("Request body is too large", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        try:
            return json.loads(self.rfile.read(size) if size else b"{}")
        except json.JSONDecodeError as error:
            raise RunnerError("Invalid JSON request") from error

    def _write_json(self, payload: Any, status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    ensure_startup_invariants()
    server = ThreadingHTTPServer((RUNNER_HOST, RUNNER_PORT), RunnerHandler)
    reaper_stop_event = threading.Event()
    reaper_thread = threading.Thread(target=runtime_reaper, args=(reaper_stop_event,), daemon=True)
    reaper_thread.start()
    print(
        f"[nsjail-runner] listening on {RUNNER_HOST}:{RUNNER_PORT}; workspace_root={WORKSPACE_ROOT}; cgroup_v2={USE_CGROUP_V2}",
        flush=True,
    )
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        reaper_stop_event.set()
        reaper_thread.join(timeout=2)
        with RUNTIMES_LOCK:
            runtimes = list(RUNTIMES.values())
            RUNTIMES.clear()
        for runtime in runtimes:
            runtime.destroy()
        server.server_close()


if __name__ == "__main__":
    main()
