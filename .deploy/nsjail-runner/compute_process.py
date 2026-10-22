"""Invariants: fixed argv, private network, no capabilities, RO root/inputs, cgroup v2.
Scratch mounts and cgroups belong to a single Job and outlive its process only for output collection.
"""
import codecs
import json
import math
import os
import pathlib
import re
import shutil
import signal
import subprocess
import threading
import time
import uuid

import runner
from compute_storage import runtime_id

ROOTFS = pathlib.Path("/opt/xpert-compute-rootfs")
STATE_ROOT = pathlib.Path("/run/xpert-compute")
UID = 10001
MIB = 1024 * 1024
COMMAND = ["node", "/opt/xpert/sandbox-runtime/runner-host.mjs"]
ACTION_ARGS = ["--request", "/workspace/input/job.json", "--output", "/workspace/output",
               "--action-root", "/workspace/runtime/action", "--action-manifest", "/workspace/runtime/action-manifest.json"]


def run_control(argv):
    subprocess.run(argv, check=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                   stderr=subprocess.PIPE, timeout=5)


class ComputeJob:
    # Subclasses are trusted Runner profiles; none of these settings come from RPC data.
    rootfs = ROOTFS
    state_root = STATE_ROOT
    namespace = "compute"
    environment = {}
    loopback = False
    cpu_topology = False
    pids = 64
    open_files = 128

    def __init__(self, identity, definition):
        self.identity = runtime_id(identity)
        self.definition = definition
        self.root = self.state_root / self.identity
        self.workspace = self.root / "workspace"
        self.scratch = self.root / "scratch"
        self.shm = self.root / "shm"
        self.cgroup = runner.CGROUP_ROOT / f"xpert-{self.namespace}-{uuid.uuid4().hex}-{self.identity}"
        self.lock = threading.RLock()
        self.finished = threading.Event()
        self.cancelled = threading.Event()
        self.sealed = False
        self.destroyed = False
        self.uploaded_files = 0
        self.process = None
        self.mounts = []
        self.owns_cgroup = False
        self.created = time.monotonic()
        self.deadline = self.created + definition["hardDeadlineMs"] / 1000

    def prepare(self):
        self.root.mkdir(mode=0o755)
        try:
            self.root.chmod(0o755)
            (self.root / "owner.json").write_text(json.dumps({"version": 1, "cgroup": self.cgroup.name}))
            resources = self.definition["resources"]
            self.cgroup.mkdir()
            self.owns_cgroup = True
            if not (self.cgroup / "cgroup.kill").is_file():
                raise RuntimeError("Compute requires cgroup.kill (Linux 5.14 or newer)")
            for name, value in {
                "memory.max": str(resources["memoryMb"] * MIB), "memory.swap.max": "0",
                "pids.max": str(self.pids), "cpu.max": f'{int(resources["cpu"] * 100000)} 100000',
                "cgroup.subtree_control": "+cpu +memory +pids",
            }.items():
                (self.cgroup / name).write_text(value)
            for target, size in [(self.workspace, 64), (self.scratch, resources["tempDiskMb"]), (self.shm, resources["shmSizeMb"])]:
                target.mkdir()
                run_control(["mount", "-t", "tmpfs", "-o", f"size={size * MIB},nr_inodes=8192,mode=0755,nosuid,nodev", "tmpfs", str(target)])
                self.mounts.append(target)
            for area in ("input", "runtime", "invocations", "output"):
                (self.workspace / area).mkdir(mode=0o755)
                (self.workspace / area).chmod(0o755)
            for area in ("tmp", "run", "output"):
                directory = self.scratch / area
                directory.mkdir(mode=0o700)
                os.chown(directory, UID, UID)
            os.chown(self.shm, UID, UID)
        except BaseException:
            self.destroy()
            raise

    def ensure_active(self):
        if self.destroyed or self.cancelled.is_set():
            raise runner.RunnerError("Compute runtime is no longer active", 410)

    def args(self, command, timeout_ms):
        resources = self.definition["resources"]
        args = [runner.NSJAIL_BIN, "--mode", "o", "--quiet", "--chroot", str(self.rootfs),
                "--cwd", "/workspace", "--hostname", f"xpert-{self.namespace}", "--user", f"{UID}:{UID}:1",
                "--group", f"{UID}:{UID}:1", "--bindmount_ro", f"{self.workspace}:/workspace",
                "--bindmount", f"{self.scratch / 'output'}:/workspace/output",
                "--bindmount", f"{self.scratch / 'tmp'}:/tmp", "--bindmount", f"{self.scratch / 'run'}:/run",
                "--bindmount", f"{self.shm}:/dev/shm", "--rlimit_as", "max", "--rlimit_cpu", "max",
                "--rlimit_nproc", "max", "--rlimit_nofile", str(self.open_files), "--rlimit_fsize", str(resources["tempDiskMb"]),
                "--time_limit", str(max(1, math.ceil(timeout_ms / 1000))), "--max_cpus", str(math.ceil(resources["cpu"])),
                "--seccomp_policy", runner.SECCOMP_POLICY, "--use_cgroupv2", "--cgroupv2_mount", str(self.cgroup),
                "--cgroup_mem_max", str(resources["memoryMb"] * MIB), "--cgroup_mem_swap_max", "0",
                "--cgroup_pids_max", str(self.pids), "--cgroup_cpu_ms_per_sec", str(int(resources["cpu"] * 1000)),
                "--forward_signals"]
        if not self.loopback:
            args.append("--iface_no_lo")
        if self.cpu_topology:
            # ARM OCR kernels need CPU identification; expose only this fixed, read-only subtree.
            args.extend(["--bindmount_ro", "/sys/devices/system/cpu:/sys/devices/system/cpu"])
        for device in ("null", "zero", "urandom", "random"):
            args.extend(["--bindmount", f"/dev/{device}:/dev/{device}"])
        for name, value in {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/tmp/home", "LANG": "C.UTF-8",
                            "PYTHONDONTWRITEBYTECODE": "1", "XDG_CACHE_HOME": "/tmp/cache", **self.environment}.items():
            args.extend(["--env", f"{name}={value}"])
        # NsJail defaults enforce namespace isolation, RO chroot, no_new_privs and empty capabilities.
        return args + ["--", "/usr/local/bin/node", *command[1:]]

    def kill(self):
        if self.owns_cgroup:
            try:
                (self.cgroup / "cgroup.kill").write_text("1")
            except FileNotFoundError:
                pass
        if self.process and self.process.poll() is None:
            try:
                os.killpg(self.process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    def cancel(self):
        with self.lock:
            self.cancelled.set()
            self.kill()

    def execute(self, timeout_ms, max_output_bytes, on_output, disconnected, command=None):
        with self.lock:
            self.ensure_active()
            if self.sealed:
                raise runner.RunnerError("Compute runtime can execute only once", 409)
            self.sealed = True
        output = bytearray()
        truncated = False
        reason = None
        deadline = min(self.deadline, time.monotonic() + timeout_ms / 1000)
        decoder = codecs.getincrementaldecoder("utf-8")("replace")

        def consume(chunk):
            nonlocal truncated
            remaining = max(0, max_output_bytes - len(output))
            accepted = chunk[:remaining]
            output.extend(accepted)
            truncated |= len(chunk) > remaining
            if accepted:
                on_output(decoder.decode(accepted))

        try:
            with self.lock:
                self.ensure_active()
                self.process = subprocess.Popen(self.args(command or COMMAND + ACTION_ARGS, max(1, int((deadline - time.monotonic()) * 1000))),
                                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                                start_new_session=True)
            os.set_blocking(self.process.stdout.fileno(), False)
            while True:
                if self.cancelled.is_set() or disconnected():
                    reason = "cancelled"
                    self.kill()
                elif time.monotonic() >= deadline:
                    reason = "deadline"
                    self.kill()
                chunk = os.read(self.process.stdout.fileno(), 65536) if self._readable() else b""
                if chunk:
                    consume(chunk)
                if self.process.poll() is not None:
                    # Kill orphan children before draining the pipe or exposing any output files.
                    self.kill()
                    while self._readable():
                        chunk = os.read(self.process.stdout.fileno(), 65536)
                        if not chunk:
                            break
                        consume(chunk)
                    break
                time.sleep(0.01)
            tail = decoder.decode(b"", final=True)
            if tail:
                on_output(tail)
            events = dict(line.split() for line in (self.cgroup / "memory.events").read_text().splitlines())
            if int(events.get("oom_kill", 0)):
                reason = "oom"
                peak = (self.cgroup / "memory.peak").read_text().strip() if (self.cgroup / "memory.peak").exists() else "unknown"
                print(f"[nsjail-jobs] {self.namespace} OOM: peak={peak}, limit={self.definition['resources']['memoryMb'] * MIB}, events={events}", flush=True)
            if not reason and self.process.returncode == 137 and time.monotonic() >= deadline - 0.1:
                reason = "deadline"
            return {"output": output.decode("utf-8", errors="replace"), "exitCode": self.process.returncode,
                    "truncated": truncated, "timedOut": reason == "deadline", **({"terminationReason": reason} if reason else {})}
        finally:
            self.kill()
            if self.process:
                self.process.wait(timeout=5)
                self.process.stdout.close()
            self.finished.set()

    def _readable(self):
        import select
        return bool(select.select([self.process.stdout], [], [], 0)[0])

    def destroy(self):
        self.cancel()
        if self.sealed and not self.finished.wait(6):
            raise runner.RunnerError("Compute execution cleanup did not finish", 503)
        with self.lock:
            if self.destroyed:
                return
            for mount in reversed(self.mounts[:]):
                run_control(["umount", str(mount)])
                self.mounts.remove(mount)
            if self.owns_cgroup:
                for attempt in range(40):
                    try:
                        for child in self.cgroup.iterdir():
                            if child.is_dir():
                                child.rmdir()
                        self.cgroup.rmdir()
                        break
                    except FileNotFoundError:
                        break
                    except OSError:
                        if attempt == 39:
                            raise
                        time.sleep(0.05)
                self.owns_cgroup = False
            shutil.rmtree(self.root, ignore_errors=False)
            self.destroyed = True

    @classmethod
    def recover(cls, root, definition):
        """Recover only Runner-owned state after a container/process restart."""
        if root.is_symlink() or not root.is_dir():
            raise RuntimeError("Invalid Compute state directory")
        marker = root / "owner.json"
        if marker.is_symlink() or marker.stat().st_size > 1024:
            raise RuntimeError("Invalid Compute ownership marker")
        owner = json.loads(marker.read_text())
        if owner.get("version") != 1 or not re.fullmatch(rf"xpert-{cls.namespace}-[a-f0-9]{{32}}-" + runtime_id(root.name), owner.get("cgroup", "")):
            raise RuntimeError("Invalid Compute ownership marker")
        job = cls(root.name, definition)
        job.cgroup = runner.CGROUP_ROOT / owner["cgroup"]
        job.owns_cgroup = job.cgroup.is_dir()
        for target in (job.workspace, job.scratch, job.shm):
            if target.is_symlink():
                raise RuntimeError("Invalid Compute mount path")
            if os.path.ismount(target):
                job.mounts.append(target)
        job.destroy()
