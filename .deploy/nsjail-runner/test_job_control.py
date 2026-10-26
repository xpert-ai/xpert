"""Real durable ledger files and execution evidence, with no Docker/namespace mocks claimed as isolation tests."""
import json
import pathlib
import tempfile
import threading
import unittest
import uuid
from unittest import mock
import runner
from job_control import JobControl
from compute_service import ComputeService
from compute_process import ComputeJob


class JobControlTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.ledger = JobControl(self.root, "test")
        self.target = {"version": 1, "kind": "engine", "provider": "nsjail-compute", "runtimeProfile": "test",
                       "generation": str(uuid.uuid4()), "environmentId": self.ledger.environment, "runtimeRef": "a" * 64}
        self.service = ComputeService.__new__(ComputeService)
        self.service.control = self.ledger
        self.service.error = None
        self.service.jobs = {}
        self.service.lock = threading.RLock()

    def tearDown(self):
        self.ledger.close()
        self.temp.cleanup()

    def test_stop_before_create_is_durable_and_never_executes(self):
        self.ledger.prepare(self.target)
        reply = self.service.control_execution(self.target, "stop")
        self.assertEqual(reply["state"], "not_started")
        self.ledger.close()
        self.ledger = JobControl(self.root, "test")
        self.assertEqual(self.ledger.environment, self.target["environmentId"])
        with self.assertRaises(runner.RunnerError):
            self.ledger.admit(self.target)

    def test_duplicate_admission_is_rejected_even_after_restart(self):
        self.ledger.prepare(self.target)
        self.ledger.admit(self.target)
        self.ledger.close()
        self.ledger = JobControl(self.root, "test")
        with self.assertRaises(runner.RunnerError):
            self.ledger.admit(self.target)
        self.service.control = self.ledger
        self.assertEqual(self.service.control_execution(self.target, "stop")["state"], "unknown")

    def test_wrong_environment_generation_and_missing_target_never_stop_a_job(self):
        job = mock.Mock()
        self.service.jobs[self.target["runtimeRef"]] = job
        for target in [self.target, {**self.target, "environmentId": str(uuid.uuid4())}]:
            self.assertEqual(self.service.control_execution(target, "stop")["state"], "unknown")
        self.ledger.prepare(self.target)
        changed = {**self.target, "generation": str(uuid.uuid4())}
        self.assertEqual(self.service.control_execution(changed, "stop")["state"], "unknown")
        job.cancel.assert_not_called()

    def test_stop_ack_does_not_record_exit_until_job_has_really_finished(self):
        self.ledger.prepare(self.target)
        self.ledger.admit(self.target)
        job = mock.Mock()
        self.service.jobs[self.target["runtimeRef"]] = job
        job.execution_state.return_value = "running"
        self.assertEqual(self.service.control_execution(self.target, "stop")["state"], "running")
        self.assertEqual(self.ledger.read(self.target["runtimeRef"])["state"], "creating")
        job.execution_state.return_value = "exited"
        self.assertEqual(self.service.control_execution(self.target, "stop")["state"], "exited")
        self.ledger.close()
        self.ledger = JobControl(self.root, "test")
        self.assertEqual(self.ledger.read(self.target["runtimeRef"])["state"], "exited")

    def test_same_state_directory_has_one_control_owner(self):
        with self.assertRaises(BlockingIOError):
            JobControl(self.root, "test")

    def test_real_execution_evidence_requires_finished_body_and_empty_cgroup(self):
        job = ComputeJob("a" * 64, {"hardDeadlineMs": 10000})
        job.cgroup = self.root / "cgroup"
        job.cgroup.mkdir()
        events = job.cgroup / "cgroup.events"
        events.write_text("populated 1\nfrozen 0\n")
        job.cancelled.set()
        job.sealed = True
        self.assertEqual(job.execution_state(), "running")
        job.finished.set()
        self.assertEqual(job.execution_state(), "running")
        events.write_text("populated 0\nfrozen 0\n")
        self.assertEqual(job.execution_state(), "exited")
        events.unlink()
        self.assertEqual(job.execution_state(), "unknown")

    def test_malformed_control_cannot_address_another_path(self):
        for change in [{"runtimeRef": "../escape"}, {"runtimeProfile": "other"}, {"generation": "wrong"}, {"command": "bad"}]:
            with self.assertRaises(runner.RunnerError):
                self.ledger.prepare({**self.target, **change})


if __name__ == "__main__":
    unittest.main()
