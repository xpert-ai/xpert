"""Durable, generation-bound control records. Absence is never synthesized as an exit receipt."""
import datetime
import fcntl
import json
import os
import pathlib
import uuid
import runner
from compute_storage import runtime_id


class JobControl:
    def __init__(self, root, profile):
        self.root = root / ".control"
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.root.is_symlink():
            raise RuntimeError("Invalid control root")
        self.owner = open(self.root / "lock", "a+")
        try:
            fcntl.flock(self.owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            self.owner.close()
            raise
        self.profile = profile
        marker = self.root / "environment.json"
        if not marker.exists():
            self.write(marker, {"environmentId": str(uuid.uuid4())})
        self.environment = json.loads(marker.read_text())["environmentId"]
        uuid.UUID(self.environment)

    def close(self):
        self.owner.close()

    def write(self, path, value):
        temporary = path.with_suffix(".tmp")
        with open(temporary, "w") as file:
            json.dump(value, file)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
        directory = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def validate(self, target):
        keys = {"version", "kind", "provider", "runtimeProfile", "generation", "environmentId", "runtimeRef"}
        if not isinstance(target, dict) or set(target) != keys or target["version"] != 1 or target["kind"] != "engine":
            raise runner.RunnerError("Invalid execution control target")
        if target["provider"] not in ("nsjail-compute", "nsjail-document") or target["runtimeProfile"] != self.profile:
            raise runner.RunnerError("Invalid execution control profile", 409)
        try:
            uuid.UUID(target["generation"])
        except (ValueError, TypeError, AttributeError):
            raise runner.RunnerError("Invalid execution generation")
        runtime_id(target["runtimeRef"])
        return target["environmentId"] == self.environment

    def read(self, identity):
        path = self.root / (runtime_id(identity) + ".json")
        if not path.exists():
            return None
        return json.loads(path.read_text())

    def save(self, record):
        self.write(self.root / (runtime_id(record["target"]["runtimeRef"]) + ".json"), record)

    def prepare(self, target):
        if not self.validate(target):
            raise runner.RunnerError("Original control environment unavailable", 409)
        previous = self.read(target["runtimeRef"])
        if previous and previous["target"] != target:
            raise runner.RunnerError("Execution target conflict", 409)
        if not previous:
            self.save({"target": target, "state": "reserved"})
        return target

    def admit(self, target):
        if not self.validate(target):
            raise runner.RunnerError("Original control environment unavailable", 409)
        record = self.read(target["runtimeRef"])
        if not record or record["target"] != target or record["state"] != "reserved":
            raise runner.RunnerError("Execution already claimed or stopped", 409)
        record["state"] = "creating"
        self.save(record)

    def receipt(self, identity, state):
        record = self.read(identity)
        if record:
            record["state"] = state
            self.save(record)

    def evidence(self, target, state):
        return {"version": 1, "target": target, "state": state,
                "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")}
