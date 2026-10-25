"""Separate Jobs lifecycle; interactive Runtime IDs and commands never enter this API."""
import hashlib
import json
import threading
import time
import uuid

from job_control import JobControl
import runner
from compute_process import ComputeJob, ROOTFS, STATE_ROOT
from compute_storage import runtime_id

PROTOCOL_VERSION = 1
MAX_JOBS = 32


class ComputeService:
    rootfs = ROOTFS
    state_root = STATE_ROOT
    job_class = ComputeJob
    probe_timeout_ms = 10000
    health_ttl = 15
    max_jobs = MAX_JOBS

    def __init__(self):
        self.jobs = {}
        self.lock = threading.RLock()
        self.health_lock = threading.Lock()
        self.health_cache = None
        self.health_checked = 0
        self.error = None
        self.definition = None
        self.control = None
        try:
            self.definition = json.loads((self.rootfs / "opt/xpert/sandbox-runtime/definition.json").read_text())
            if not runner.USE_CGROUP_V2:
                raise RuntimeError("Sandbox Job requires delegated cgroup v2")
            self.state_root.mkdir(mode=0o755, parents=True, exist_ok=True)
            if self.state_root.is_symlink():
                raise RuntimeError("Invalid Sandbox Job state root")
            self.state_root.chmod(0o755)
            self.control = JobControl(self.state_root, self.definition["name"])
            for root in self.state_root.iterdir():
                if root.name == ".control":
                    continue
                self.job_class.recover(root, self.definition)
                self.control.receipt(root.name, "exited")
        except (OSError, ValueError, RuntimeError) as error:
            self.error = str(error)

    def health(self):
        with self.health_lock:
            if self.health_cache and time.monotonic() - self.health_checked < self.health_ttl:
                return self.health_cache
            result = {"available": False, "protocolVersion": PROTOCOL_VERSION}
            job = None
            try:
                if self.error:
                    raise RuntimeError(self.error)
                job = self.job_class(hashlib.sha256(uuid.uuid4().bytes).hexdigest(), self.definition)
                job.prepare()
                response = job.execute(self.probe_timeout_ms, 65536, lambda text: None, lambda: False,
                                       ["node", "/opt/xpert/sandbox-runtime/nsjail-probe.mjs"])
                if response["exitCode"] != 0:
                    print(f"[nsjail-jobs] isolation probe: {response['output'][:4096]}", flush=True)
                    raise RuntimeError("Sandbox Job isolation probe failed")
                manifest = json.loads(response["output"].splitlines()[-1])
                if any(manifest.get(key) != value for key, value in self.definition["expectedManifest"].items()):
                    raise RuntimeError("Sandbox Job runtime manifest does not match its definition")
                result.update(available=True, manifest=manifest, definition=self.definition)
            except Exception as error:
                # Diagnostics stay in Runner logs; no process output or host paths cross the health boundary.
                print(f"[nsjail-jobs] probe failed: {error!r}", flush=True)
                result["reason"] = "Sandbox Job requires the matching runtime image and delegated cgroup v2 isolation"
            finally:
                if job:
                    try:
                        job.destroy()
                    except Exception as error:
                        print(f"[nsjail-jobs] probe cleanup failed: {error!r}", flush=True)
                        result = {"available": False, "protocolVersion": PROTOCOL_VERSION, "reason": "Sandbox Job probe cleanup failed"}
                self.health_cache = result
                self.health_checked = time.monotonic()
            return result

    def create(self, payload):
        if not isinstance(payload, dict) or set(payload) not in ({"runtimeId", "definition"}, {"runtimeId", "definition", "controlTarget"}):
            raise runner.RunnerError("Invalid Sandbox Job create request")
        identity = runtime_id(payload["runtimeId"])
        if payload["definition"] != self.definition:
            raise runner.RunnerError("Incompatible Sandbox Job runtime definition", 409)
        if not self.health()["available"]:
            raise runner.RunnerError("Sandbox Job runtime is unavailable", 503)
        with self.lock:
            if identity in self.jobs:
                raise runner.RunnerError("Sandbox Job runtime already exists", 409)
            if len(self.jobs) >= self.max_jobs:
                raise runner.RunnerError("Sandbox Job runtime capacity exhausted", 429)
            target = payload.get("controlTarget")
            if target:
                if target.get("runtimeRef") != identity:
                    raise runner.RunnerError("Execution target mismatch", 409)
                self.control.admit(target)
            elif self.control.read(identity):
                raise runner.RunnerError("Controlled execution requires its original target", 409)
            job = self.job_class(identity, self.definition)
            try:
                job.prepare()
            except BaseException:
                if target and job.destroyed:
                    self.control.receipt(identity, "not_started")
                raise
            self.jobs[identity] = job
        return job

    def get(self, identity):
        with self.lock:
            job = self.jobs.get(runtime_id(identity))
        if not job:
            raise runner.RunnerError("Sandbox Job runtime not found", 404)
        return job

    def destroy(self, identity):
        with self.lock:
            job = self.jobs.get(runtime_id(identity))
        if job:
            job.destroy()
            with self.lock:
                if self.jobs.get(identity) is job:
                    self.jobs.pop(identity)
                self.control.receipt(identity, "exited")

    def prepare_control(self, target):
        with self.lock:
            if self.error or not self.control:
                raise runner.RunnerError("Execution control unavailable", 503)
            return self.control.prepare(target)

    def control_execution(self, target, action):
        with self.lock:
            if self.error or not self.control:
                raise runner.RunnerError("Execution control unavailable", 503)
            if not self.control.validate(target):
                return self.control.evidence(target, "unknown")
            record = self.control.read(target["runtimeRef"])
            if not record or record["target"] != target:
                return self.control.evidence(target, "unknown")
            identity = target["runtimeRef"]
            job = self.jobs.get(identity)
            if record["state"] in ("exited", "not_started"):
                state = record["state"]
            elif job:
                if action in ("stop", "cleanup"):
                    job.cancel()
                state = job.execution_state()
            elif record["state"] == "reserved" and action in ("stop", "cleanup"):
                state = "not_started"
            else:
                state = "unknown"
            if state in ("exited", "not_started"):
                self.control.receipt(identity, state)
                if action == "cleanup" and job:
                    self.destroy(identity)
            return self.control.evidence(target, state)

    def reap(self):
        with self.lock:
            expired = [identity for identity, job in self.jobs.items() if time.monotonic() > job.deadline + 60]
        for identity in expired:
            try:
                self.destroy(identity)
            except Exception as error:
                print(f"[nsjail-jobs] cleanup failed: {error!r}", flush=True)

    def close(self):
        try:
            for identity in list(self.jobs):
                self.destroy(identity)
        finally:
            if self.control:
                self.control.close()
