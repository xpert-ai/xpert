#!/usr/bin/env python3
"""Run the NsJail POC's executable Linux isolation and protocol checks."""

from __future__ import annotations

import base64
import concurrent.futures
import json
import os
import pathlib
import shutil
import sys
import time
import urllib.error
import urllib.request
import uuid
from typing import Any, Callable


RUNNER_URL = os.environ.get("XPERT_NSJAIL_POC_URL", "http://127.0.0.1:8090").rstrip("/")
RUNNER_TOKEN = os.environ.get("XPERT_NSJAIL_RUNNER_TOKEN", "").strip()
WORKSPACE_ROOT = pathlib.Path(os.environ.get("XPERT_NSJAIL_WORKSPACE_ROOT", "/sandbox")).resolve()
JAIL_UID = int(os.environ.get("XPERT_NSJAIL_UID", "1000"))
JAIL_GID = int(os.environ.get("XPERT_NSJAIL_GID", "1000"))
MEMORY_LIMIT_BYTES = int(os.environ.get("XPERT_NSJAIL_MEMORY_BYTES", str(2 * 1024 * 1024 * 1024)))
CPU_MS_PER_SECOND = int(os.environ.get("XPERT_NSJAIL_CPU_MS_PER_SEC", "1000"))
PIDS_LIMIT = int(os.environ.get("XPERT_NSJAIL_PIDS", "128"))
RLIMIT_AS_MB = int(os.environ.get("XPERT_NSJAIL_RLIMIT_AS_MB", "4096"))
RLIMIT_FSIZE_MB = int(os.environ.get("XPERT_NSJAIL_RLIMIT_FSIZE_MB", "256"))
RLIMIT_NOFILE = int(os.environ.get("XPERT_NSJAIL_RLIMIT_NOFILE", "256"))
USE_CGROUP_V2 = os.environ.get("XPERT_NSJAIL_USE_CGROUP_V2", "true").lower() == "true"
CGROUP_ROOT = pathlib.Path("/sys/fs/cgroup")


def read_cgroup_events(filename: str) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for cgroup in CGROUP_ROOT.glob("NSJAIL.*"):
        try:
            values = {
                name: int(value)
                for name, value in (
                    line.split(maxsplit=1) for line in (cgroup / filename).read_text().splitlines()
                )
            }
        except (OSError, ValueError):
            continue
        result[cgroup.name] = values
    return result


def wait_for_cgroup_event(
    filename: str,
    event_names: tuple[str, ...],
    *,
    before: dict[str, dict[str, int]],
    timeout_seconds: float = 5,
) -> tuple[dict[str, dict[str, int]], str, int]:
    deadline = time.monotonic() + timeout_seconds
    latest: dict[str, dict[str, int]] = {}
    while time.monotonic() < deadline:
        latest = read_cgroup_events(filename)
        for event_name in event_names:
            count = sum(
                max(0, values.get(event_name, 0) - before.get(cgroup, {}).get(event_name, 0))
                for cgroup, values in latest.items()
            )
            if count > 0:
                return latest, event_name, count
        time.sleep(0.02)
    raise AssertionError({"events": latest, "expected": event_names, "filename": filename})


class RunnerClient:
    def __init__(self, token: str = RUNNER_TOKEN) -> None:
        self.token = token

    def request(
        self,
        method: str,
        path: str,
        payload: Any | None = None,
        *,
        expect_status: int | tuple[int, ...] = 200,
    ) -> tuple[int, dict[str, str], bytes]:
        body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
        request = urllib.request.Request(
            f"{RUNNER_URL}{path}",
            data=body,
            headers={
                "authorization": f"Bearer {self.token}",
                **({"content-type": "application/json"} if body is not None else {}),
            },
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                status = response.status
                headers = {name.lower(): value for name, value in response.headers.items()}
                response_body = response.read()
        except urllib.error.HTTPError as error:
            status = error.code
            headers = {name.lower(): value for name, value in error.headers.items()}
            response_body = error.read()

        expected = (expect_status,) if isinstance(expect_status, int) else expect_status
        if status not in expected:
            raise AssertionError(
                f"{method} {path} returned {status}, expected {expected}: {response_body.decode(errors='replace')}"
            )
        return status, headers, response_body

    def json(
        self,
        method: str,
        path: str,
        payload: Any | None = None,
        *,
        expect_status: int | tuple[int, ...] = 200,
    ) -> Any:
        _, _, body = self.request(method, path, payload, expect_status=expect_status)
        return json.loads(body) if body else None


class PocProbe:
    def __init__(self) -> None:
        self.client = RunnerClient()
        self.passed: list[str] = []
        self.failed: list[dict[str, str]] = []
        self.metrics: dict[str, Any] = {
            "architecture": os.uname().machine,
            "cpuMsPerSecond": CPU_MS_PER_SECOND,
            "memoryLimitBytes": MEMORY_LIMIT_BYTES,
            "nofileLimit": RLIMIT_NOFILE,
            "pidsLimit": PIDS_LIMIT,
            "rlimitAsMb": RLIMIT_AS_MB,
            "usesCgroupV2": USE_CGROUP_V2,
        }
        self.runtime_ids: list[str] = []
        self.probe_root = WORKSPACE_ROOT / f".xpert-nsjail-poc-{uuid.uuid4().hex}"
        self.workspace_a = self.probe_root / "workspace-a"
        self.workspace_b = self.probe_root / "workspace-b"
        self.runtime_a = uuid.uuid4().hex
        self.runtime_b = uuid.uuid4().hex

    def check(self, name: str, callback: Callable[[], None]) -> None:
        started_at = time.monotonic()
        try:
            callback()
            duration_ms = round((time.monotonic() - started_at) * 1000, 1)
            self.passed.append(name)
            print(f"PASS {name} ({duration_ms}ms)", flush=True)
        except Exception as error:
            self.failed.append({"check": name, "error": str(error)})
            print(f"FAIL {name}: {error}", flush=True)

    def create_workspace(self, path: pathlib.Path) -> None:
        path.mkdir(parents=True)
        os.chown(path, JAIL_UID, JAIL_GID)
        path.chmod(0o700)

    def create_runtime(self, runtime_id: str, workspace: pathlib.Path) -> None:
        self.client.json(
            "POST",
            "/v1/runtimes",
            {
                "runtimeId": runtime_id,
                "workingDirectory": "/workspace",
                "workspacePath": str(workspace),
            },
            expect_status=201,
        )
        self.runtime_ids.append(runtime_id)

    def exec(
        self,
        runtime_id: str,
        command: str,
        *,
        timeout_ms: int = 10_000,
        max_output_bytes: int = 1024 * 1024,
    ) -> dict[str, Any]:
        return self.client.json(
            "POST",
            f"/v1/runtimes/{runtime_id}/exec",
            {
                "command": command,
                "maxOutputBytes": max_output_bytes,
                "timeoutMs": timeout_ms,
            },
        )

    def python_command(self, source: str) -> str:
        encoded = base64.b64encode(source.encode()).decode()
        return f"python3 -c \"import base64;exec(base64.b64decode('{encoded}'))\""

    def prepare(self) -> None:
        if not RUNNER_TOKEN:
            raise SystemExit("XPERT_NSJAIL_RUNNER_TOKEN is required")
        self.probe_root.mkdir(parents=True)
        self.create_workspace(self.workspace_a)
        self.create_workspace(self.workspace_b)
        secret = self.workspace_b / "workspace-b-secret.txt"
        secret.write_text("workspace-b")
        os.chown(secret, JAIL_UID, JAIL_GID)
        self.create_runtime(self.runtime_a, self.workspace_a)
        self.create_runtime(self.runtime_b, self.workspace_b)

    def cleanup(self) -> None:
        for runtime_id in reversed(self.runtime_ids):
            try:
                self.client.request(
                    "DELETE",
                    f"/v1/runtimes/{runtime_id}",
                    expect_status=(204, 404),
                )
            except Exception as error:
                self.failed.append({"check": "runtime cleanup", "error": f"{runtime_id}: {error}"})
        shutil.rmtree(self.probe_root, ignore_errors=True)

    def run(self) -> int:
        self.prepare()
        try:
            self.check("authenticated health", self.check_health)
            self.check("invalid token rejected", self.check_invalid_token)
            self.check("execute result model", self.check_execute_result)
            self.check("stream flushes final line", self.check_stream)
            self.check("workspace persists across commands", self.check_workspace_persistence)
            self.check("namespace and rootfs isolation", self.check_namespace_and_rootfs)
            self.check("credentials and Docker socket hidden", self.check_credentials_hidden)
            self.check("cross-workspace access blocked", self.check_cross_workspace)
            self.check("default network and metadata access blocked", self.check_network)
            self.check("file channel traversal links blocked", self.check_file_boundaries)
            self.check("timeout terminates descendants", self.check_timeout_cleanup)
            self.check("pids limit blocks fork growth", self.check_pids_limit)
            self.check("memory limit contains OOM workload", self.check_memory_limit)
            self.check("CPU limit throttles workload", self.check_cpu_limit)
            self.check("nofile limit is enforced", self.check_nofile_limit)
            self.check("fsize limit is enforced", self.check_fsize_limit)
            self.check("seccomp kills forbidden syscall", self.check_seccomp)
            self.check("PTY resize input and close", self.check_terminal)
            self.check("managed service proxy logs stop restart", self.check_managed_service)
            self.check("multiple jails execute concurrently", self.check_parallel_jails)
        finally:
            self.cleanup()

        self.check("runtime state and cgroups are cleaned", self.check_runtime_cleanup)
        report = {
            "failed": self.failed,
            "metrics": self.metrics,
            "passed": self.passed,
            "summary": {"failed": len(self.failed), "passed": len(self.passed)},
        }
        print(json.dumps(report, indent=2, sort_keys=True), flush=True)
        return 1 if self.failed else 0

    def check_health(self) -> None:
        result = self.client.json("GET", "/health")
        assert result == {"status": "ok"}, result

    def check_invalid_token(self) -> None:
        result = RunnerClient("invalid-token").json("GET", "/health", expect_status=401)
        assert result == {"error": "Unauthorized"}, result

    def check_execute_result(self) -> None:
        result = self.exec(self.runtime_a, "printf alpha; exit 7")
        assert result == {"exitCode": 7, "output": "alpha", "timedOut": False, "truncated": False}, result
        truncated = self.exec(self.runtime_a, "printf 0123456789abcdef", max_output_bytes=8)
        assert truncated["output"] == "01234567", truncated
        assert truncated["truncated"] is True, truncated

    def check_stream(self) -> None:
        _, headers, body = self.client.request(
            "POST",
            f"/v1/runtimes/{self.runtime_a}/exec/stream",
            {"command": "printf 'first\\nlast'", "maxOutputBytes": 1024, "timeoutMs": 5000},
        )
        assert headers.get("content-type") == "application/x-ndjson", headers
        events = [json.loads(line) for line in body.decode().splitlines()]
        assert [event.get("data") for event in events if event.get("type") == "line"] == ["first", "last"], events
        assert events[-1]["type"] == "result" and events[-1]["result"]["exitCode"] == 0, events

    def check_workspace_persistence(self) -> None:
        written = self.exec(self.runtime_a, "printf shared > /workspace/persisted.txt")
        assert written["exitCode"] == 0, written
        read = self.exec(self.runtime_a, "cat /workspace/persisted.txt")
        assert read["output"] == "shared" and read["exitCode"] == 0, read

    def check_namespace_and_rootfs(self) -> None:
        namespace_names = ("user", "mnt", "pid", "net")
        runner_namespaces = {name: os.readlink(f"/proc/self/ns/{name}") for name in namespace_names}
        command = "for name in user mnt pid net; do printf '%s=' \"$name\"; readlink /proc/self/ns/$name; done"
        result = self.exec(self.runtime_a, command)
        assert result["exitCode"] == 0, result
        jail_namespaces = dict(line.split("=", 1) for line in result["output"].splitlines())
        assert set(jail_namespaces) == set(namespace_names), jail_namespaces
        assert all(jail_namespaces[name] != runner_namespaces[name] for name in namespace_names), {
            "jail": jail_namespaces,
            "runner": runner_namespaces,
        }
        rootfs = self.exec(
            self.runtime_a,
            "test ! -e /app/runner.py && test ! -e /sandbox && ! touch /etc/xpert-poc-write",
        )
        assert rootfs["exitCode"] == 0, rootfs

    def check_credentials_hidden(self) -> None:
        result = self.exec(
            self.runtime_a,
            "test ! -e /var/run/docker.sock && ! env | grep -E '(NSJAIL_RUNNER|DATABASE_URL|DB_PASSWORD|REDIS_URL|AWS_SECRET)'",
        )
        assert result["exitCode"] == 0, result

    def check_cross_workspace(self) -> None:
        result = self.exec(
            self.runtime_a,
            "test ! -e /workspace/workspace-b-secret.txt && test ! -e /sandbox/workspace-b/workspace-b-secret.txt",
        )
        assert result["exitCode"] == 0, result

    def check_network(self) -> None:
        source = """
import socket
targets = [('169.254.169.254', 80), ('127.0.0.1', 5432), ('127.0.0.1', 6379)]
for target in targets:
    sock = socket.socket()
    sock.settimeout(0.5)
    try:
        result = sock.connect_ex(target)
    except OSError:
        result = 1
    finally:
        sock.close()
    if result == 0:
        raise SystemExit(f'connected:{target}')
print('blocked')
"""
        result = self.exec(self.runtime_a, self.python_command(source))
        assert result["exitCode"] == 0 and "blocked" in result["output"], result

    def check_file_boundaries(self) -> None:
        content = base64.b64encode(b"file-channel").decode()
        upload = self.client.json(
            "POST",
            f"/v1/runtimes/{self.runtime_a}/files/upload",
            {"files": [{"contentBase64": content, "path": "/workspace/nested/file.txt"}]},
        )
        assert upload == [{"error": None, "path": "/workspace/nested/file.txt"}], upload
        download = self.client.json(
            "POST",
            f"/v1/runtimes/{self.runtime_a}/files/download",
            {"paths": ["/workspace/nested/file.txt"]},
        )
        assert download[0]["contentBase64"] == content and download[0]["error"] is None, download
        editable = self.exec(self.runtime_a, "printf -- '-edited' >> /workspace/nested/file.txt")
        assert editable["exitCode"] == 0, editable
        uploaded = self.workspace_a / "nested" / "file.txt"
        assert (uploaded.stat().st_uid, uploaded.stat().st_gid) == (JAIL_UID, JAIL_GID), uploaded.stat()

        outside = self.probe_root / "outside.txt"
        outside.write_text("outside")
        (self.workspace_a / "symlink.txt").symlink_to(outside)
        os.link(outside, self.workspace_a / "hardlink.txt")
        blocked = self.client.json(
            "POST",
            f"/v1/runtimes/{self.runtime_a}/files/download",
            {"paths": ["/workspace/../outside.txt", "/workspace/symlink.txt", "/workspace/hardlink.txt"]},
        )
        assert [entry["error"] for entry in blocked] == ["invalid_path", "invalid_path", "invalid_path"], blocked

    def check_timeout_cleanup(self) -> None:
        leak_path = self.workspace_a / "timeout-leak.txt"
        result = self.exec(
            self.runtime_a,
            "(sleep 2; printf leaked > /workspace/timeout-leak.txt) & wait",
            timeout_ms=250,
        )
        assert result["timedOut"] is True and result["exitCode"] is None, result
        time.sleep(2.2)
        assert not leak_path.exists(), "timed-out descendant wrote after the jail was terminated"

    def check_pids_limit(self) -> None:
        assert USE_CGROUP_V2, "PID containment POC requires cgroup v2"
        before_events = read_cgroup_events("pids.events")
        source = """
import os
import signal
import time
children = []
try:
    while True:
        pid = os.fork()
        if pid == 0:
            time.sleep(30)
            os._exit(0)
        children.append(pid)
except OSError:
    print(f'blocked:{len(children)}')
    time.sleep(1)
finally:
    for pid in children:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    for pid in children:
        try:
            os.waitpid(pid, 0)
        except ChildProcessError:
            pass
"""
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                self.exec,
                self.runtime_a,
                self.python_command(source),
                timeout_ms=10_000,
            )
            observed_events, _event_name, pids_max_events = wait_for_cgroup_event(
                "pids.events",
                ("max",),
                before=before_events,
            )
            result = future.result(timeout=15)
        assert result["exitCode"] == 0 and "blocked:" in result["output"], result
        forked = int(result["output"].strip().split(":", 1)[1])
        assert 0 < forked < PIDS_LIMIT, {"forked": forked, "limit": PIDS_LIMIT, "result": result}
        assert pids_max_events > 0, observed_events
        self.metrics["forkedBeforePidsLimit"] = forked
        self.metrics["pidsCgroupMaxEvents"] = pids_max_events

    def check_memory_limit(self) -> None:
        assert USE_CGROUP_V2, "Memory containment POC requires cgroup v2"
        rlimit_as_bytes = RLIMIT_AS_MB * 1024 * 1024
        headroom = max(64 * 1024 * 1024, MEMORY_LIMIT_BYTES // 8)
        allocation = MEMORY_LIMIT_BYTES + headroom
        assert allocation + 128 * 1024 * 1024 < rlimit_as_bytes, {
            "allocation": allocation,
            "rlimitAsBytes": rlimit_as_bytes,
        }
        before_events = read_cgroup_events("memory.events")
        allocation_command = self.python_command(f"value = bytearray({allocation}); print(len(value))")
        command = f'{allocation_command} & child=$!; wait "$child"; code=$?; sleep 1; exit "$code"'
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(self.exec, self.runtime_a, command, timeout_ms=15_000)
            observed_events, memory_event_name, oom_events = wait_for_cgroup_event(
                "memory.events",
                ("oom_kill", "oom"),
                before=before_events,
            )
            result = future.result(timeout=20)
        assert result["exitCode"] not in (0, None), result
        assert self.client.json("GET", "/health") == {"status": "ok"}
        assert oom_events > 0, observed_events
        self.metrics["oomExitCode"] = result["exitCode"]
        self.metrics["memoryCgroupEvent"] = memory_event_name
        self.metrics["memoryCgroupOomEvents"] = oom_events

    def check_cpu_limit(self) -> None:
        source = """
import time
wall_start = time.monotonic()
cpu_start = time.process_time()
while time.monotonic() - wall_start < 2.5:
    pass
print(time.process_time() - cpu_start)
"""
        result = self.exec(self.runtime_a, self.python_command(source), timeout_ms=10_000)
        assert result["exitCode"] == 0, result
        cpu_seconds = float(result["output"].strip())
        expected_max = max(0.75, CPU_MS_PER_SECOND / 1000 * 2.5 * 2)
        assert cpu_seconds <= expected_max, {"cpuSeconds": cpu_seconds, "expectedMax": expected_max}
        self.metrics["cpuSecondsDuring2.5sWall"] = cpu_seconds

    def check_nofile_limit(self) -> None:
        source = """
opened = []
try:
    while True:
        opened.append(open('/dev/null', 'rb'))
except OSError:
    print(f'blocked:{len(opened)}')
finally:
    for handle in opened:
        handle.close()
"""
        result = self.exec(self.runtime_a, self.python_command(source))
        assert result["exitCode"] == 0 and "blocked:" in result["output"], result
        opened = int(result["output"].strip().split(":", 1)[1])
        assert 0 < opened < RLIMIT_NOFILE, {"opened": opened, "limit": RLIMIT_NOFILE}
        self.metrics["openedBeforeNofileLimit"] = opened

    def check_fsize_limit(self) -> None:
        write_bytes = (RLIMIT_FSIZE_MB + 1) * 1024 * 1024
        source = f"open('/workspace/fsize.bin', 'wb').write(b'x' * {write_bytes})"
        result = self.exec(self.runtime_a, self.python_command(source), timeout_ms=10_000)
        assert result["exitCode"] not in (0, None), result
        size = (self.workspace_a / "fsize.bin").stat().st_size
        assert size <= RLIMIT_FSIZE_MB * 1024 * 1024, {"actualSize": size, "limitMb": RLIMIT_FSIZE_MB}
        self.metrics["fsizeBytesWritten"] = size

    def check_seccomp(self) -> None:
        source = """
import ctypes
libc = ctypes.CDLL(None)
libc.unshare(0x00020000)
print('forbidden syscall returned')
"""
        result = self.exec(self.runtime_a, self.python_command(source))
        assert result["exitCode"] not in (0, None), result
        assert "forbidden syscall returned" not in result["output"], result
        self.metrics["seccompExitCode"] = result["exitCode"]

    def terminal_event(self, terminal_id: str) -> dict[str, Any]:
        return self.client.json("GET", f"/v1/runtimes/{self.runtime_a}/terminals/{terminal_id}/events")

    def check_terminal(self) -> None:
        opened = self.client.json(
            "POST",
            f"/v1/runtimes/{self.runtime_a}/terminals",
            {"cols": 80, "rows": 24},
            expect_status=201,
        )
        terminal_id = opened["terminalId"]
        exited = False
        try:
            output = ""
            for _ in range(5):
                event = self.terminal_event(terminal_id)
                output += event["output"]
                exited = event["exited"]
                if "$ " in output or "# " in output:
                    break
            assert not exited and ("$ " in output or "# " in output), {
                "exited": exited,
                "output": output,
            }
            self.client.json(
                "POST",
                f"/v1/runtimes/{self.runtime_a}/terminals/{terminal_id}/resize",
                {"cols": 100, "rows": 40},
            )
            self.client.json(
                "POST",
                f"/v1/runtimes/{self.runtime_a}/terminals/{terminal_id}/input",
                {"data": "stty size; printf 'pty-ok\\n'; sleep 30\n"},
            )
            for _ in range(3):
                event = self.terminal_event(terminal_id)
                output += event["output"]
                if "40 100" in output:
                    break
            assert "40 100" in output and "pty-ok" in output, output
            self.client.json(
                "POST",
                f"/v1/runtimes/{self.runtime_a}/terminals/{terminal_id}/input",
                {"data": "\u0003"},
            )
            self.client.json(
                "POST",
                f"/v1/runtimes/{self.runtime_a}/terminals/{terminal_id}/input",
                {"data": "printf 'interrupted\\n'; exit\n"},
            )
            for _ in range(5):
                event = self.terminal_event(terminal_id)
                output += event["output"]
                exited = event["exited"]
                if exited:
                    break
            assert exited and "interrupted" in output, {"exited": exited, "output": output}
        finally:
            if not exited:
                self.client.request(
                    "DELETE",
                    f"/v1/runtimes/{self.runtime_a}/terminals/{terminal_id}",
                    expect_status=(204, 404),
                )

    def check_managed_service(self) -> None:
        service_id = "poc-http"
        payload = {
            "command": "python3 -m http.server 8123 --bind 127.0.0.1",
            "cwd": "/workspace",
            "env": [],
            "port": 8123,
            "readyPattern": None,
            "serviceId": service_id,
        }
        started = self.client.json(
            "POST",
            f"/v1/runtimes/{self.runtime_a}/services",
            payload,
            expect_status=201,
        )
        assert started["status"] == "running", started
        try:
            _, _, body = self.client.request(
                "POST",
                f"/v1/runtimes/{self.runtime_a}/services/{service_id}/proxy",
                {"bodyBase64": "", "headers": {}, "method": "GET", "path": "/"},
            )
            assert b"Directory listing" in body, body[:200]
            deadline = time.monotonic() + 2
            logs = {"stderr": "", "stdout": ""}
            while time.monotonic() < deadline and "GET / HTTP" not in logs["stderr"]:
                logs = self.client.json(
                    "GET",
                    f"/v1/runtimes/{self.runtime_a}/services/{service_id}/logs?tail=20",
                )
                if "GET / HTTP" not in logs["stderr"]:
                    time.sleep(0.05)
            assert "GET / HTTP" in logs["stderr"], logs
        finally:
            stopped = self.client.json("DELETE", f"/v1/runtimes/{self.runtime_a}/services/{service_id}")
            assert stopped["status"] == "stopped", stopped

        restarted = self.client.json(
            "POST",
            f"/v1/runtimes/{self.runtime_a}/services",
            payload,
            expect_status=201,
        )
        assert restarted["status"] == "running", restarted
        stopped = self.client.json("DELETE", f"/v1/runtimes/{self.runtime_a}/services/{service_id}")
        assert stopped["status"] == "stopped", stopped

    def check_parallel_jails(self) -> None:
        entries: list[tuple[str, pathlib.Path, str]] = []
        for index in range(8):
            runtime_id = uuid.uuid4().hex
            workspace = self.probe_root / f"parallel-{index}"
            self.create_workspace(workspace)
            self.create_runtime(runtime_id, workspace)
            entries.append((runtime_id, workspace, f"jail-{index}"))

        started_at = time.monotonic()
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(entries)) as executor:
            futures = [
                executor.submit(self.exec, runtime_id, f"printf {expected} > /workspace/identity; cat /workspace/identity")
                for runtime_id, _workspace, expected in entries
            ]
            results = [future.result(timeout=20) for future in futures]
        duration_ms = round((time.monotonic() - started_at) * 1000, 1)
        for result, (_runtime_id, workspace, expected) in zip(results, entries):
            assert result["exitCode"] == 0 and result["output"] == expected, result
            assert (workspace / "identity").read_text() == expected
        self.metrics["parallelEightJailsMs"] = duration_ms

    def check_runtime_cleanup(self) -> None:
        for runtime_id in self.runtime_ids:
            self.client.json(
                "GET",
                f"/v1/runtimes/{runtime_id}/services",
                expect_status=404,
            )
            assert not (pathlib.Path("/var/lib/xpert-nsjail") / runtime_id).exists(), runtime_id
        residual_cgroups = sorted(
            path.name for path in pathlib.Path("/sys/fs/cgroup").glob("NSJAIL.*") if path.is_dir()
        )
        assert not residual_cgroups, residual_cgroups


if __name__ == "__main__":
    sys.exit(PocProbe().run())
