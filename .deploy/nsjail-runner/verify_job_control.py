#!/usr/bin/env python3
"""Opt-in real Runner RPC + cgroup tests, extending the fixed-command Compute acceptance fixture."""
import concurrent.futures
import hashlib
import json
import pathlib
import time
import urllib.error
import unittest
import uuid
from verify_compute import ComputeIntegrationTest, CGROUP_ROOT, PREFIX, rpc


class ControlledJobIntegration(ComputeIntegrationTest):
    # Run only this batch's cases here; the original compute suite is run separately.
    def controlled(self, script):
        identity = hashlib.sha256(uuid.uuid4().bytes).hexdigest()
        target = {"version": 1, "kind": "engine", "provider": "nsjail-compute",
                  "runtimeProfile": self.definition["name"], "generation": str(uuid.uuid4()),
                  "environmentId": rpc(PREFIX + "/control-environment")["environmentId"], "runtimeRef": identity}
        self.assertEqual(rpc(PREFIX + "/controls/prepare", target), target)
        rpc(PREFIX + "/jobs", {"runtimeId": identity, "definition": self.definition, "controlTarget": target})
        self.jobs.append(identity)
        self.upload(identity, {"runtime/action/runner.mjs": script,
                    "runtime/action-manifest.json": json.dumps({"name": "compute.probe", "version": "1.0.0", "runtimeContractVersion": "1", "entrypoint": "runner.mjs"}),
                    "input/job.json": '{"payload":{}}'})
        return target

    def evidence(self, target, action):
        return rpc(PREFIX + "/controls/" + action, target)

    def await_exit(self, target):
        until = time.monotonic() + 10
        while time.monotonic() < until:
            evidence = self.evidence(target, "inspect")
            if evidence["state"] in ("exited", "not_started"):
                return evidence
            time.sleep(.05)
        self.fail("actual cgroup exit was not confirmed")

    def test_control_cross_client_cancel_and_no_reexecution(self):
        script = "import{spawn}from'node:child_process';const c=spawn(process.execPath,['-e',\"setInterval(()=>{},1000)\"],{detached:true,stdio:'ignore'});c.unref();setInterval(()=>console.log('alive'),25)"
        target = self.controlled(script)
        with concurrent.futures.ThreadPoolExecutor() as pool:
            execution = pool.submit(self.execute, target["runtimeRef"], 10000)
            until = time.monotonic() + 5
            groups = list(CGROUP_ROOT.glob('xpert-compute-*-' + target["runtimeRef"]))
            self.assertEqual(len(groups), 1)
            events = groups[0] / "cgroup.events"
            while "populated 1" not in events.read_text() and time.monotonic() < until:
                time.sleep(.02)
            self.assertIn("populated 1", events.read_text())
            # A new HTTP client controls the original Runner generation; acceptance alone is not the assertion.
            accepted = self.evidence(target, "stop")
            self.assertIn(accepted["state"], ("running", "exited"))
            execution.result(timeout=10)
            self.assertEqual(self.await_exit(target)["state"], "exited")
            self.assertIn("populated 0", events.read_text())
            with self.assertRaises(urllib.error.HTTPError):
                self.execute(target["runtimeRef"])
            with self.assertRaises(urllib.error.HTTPError):
                rpc(PREFIX + "/jobs", {"runtimeId": target["runtimeRef"], "definition": self.definition, "controlTarget": target})
        print('AFTER_REAL_NSJAIL', json.dumps({"exitReceipt": "exited", "populated": 0, "executions": 1, "duplicateRejected": True}))

    def test_control_leader_exit_still_cleans_escaped_descendant(self):
        target = self.controlled("import{spawn}from'node:child_process';const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});c.unref();setTimeout(()=>process.exit(0),200)")
        result = self.execute(target["runtimeRef"])
        self.assertEqual(result["exitCode"], 0)
        self.assertEqual(self.await_exit(target)["state"], "exited")
        group = next(CGROUP_ROOT.glob('xpert-compute-*-' + target["runtimeRef"]))
        self.assertIn('populated 0', (group / 'cgroup.events').read_text())

    def test_control_old_generation_and_environment_never_stop_new_job(self):
        target = self.controlled("setTimeout(()=>{},2000)")
        for wrong in [{**target, "generation": str(uuid.uuid4())}, {**target, "environmentId": str(uuid.uuid4())}]:
            self.assertEqual(self.evidence(wrong, "stop")["state"], "unknown")
        self.assertEqual(self.execute(target["runtimeRef"])["exitCode"], 0)
        self.assertEqual(self.await_exit(target)["state"], "exited")

    def test_control_stop_before_create_remains_sealed(self):
        target = {"version": 1, "kind": "engine", "provider": "nsjail-compute", "runtimeProfile": self.definition["name"],
                  "generation": str(uuid.uuid4()), "environmentId": rpc(PREFIX + "/control-environment")["environmentId"],
                  "runtimeRef": hashlib.sha256(uuid.uuid4().bytes).hexdigest()}
        rpc(PREFIX + "/controls/prepare", target)
        self.assertEqual(self.evidence(target, "stop")["state"], "not_started")
        with self.assertRaises(urllib.error.HTTPError):
            rpc(PREFIX + "/jobs", {"runtimeId": target["runtimeRef"], "definition": self.definition, "controlTarget": target})


if __name__ == '__main__':
    suite = unittest.TestSuite(ControlledJobIntegration(name) for name in dir(ControlledJobIntegration) if name.startswith('test_control_'))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
