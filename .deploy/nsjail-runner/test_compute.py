import base64
import json
import pathlib
import tempfile
import threading
import unittest
from unittest import mock

import runner
from compute_process import ComputeJob
from compute_service import ComputeService
from compute_storage import download, file_parts, upload

DEFINITION = json.loads((pathlib.Path(__file__).resolve().parents[2] / "packages/server-ai/src/sandbox/sandbox-job/runtime-definitions/compute-node-python-v1.json").read_text())


class ComputeFilesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.job = ComputeJob("a" * 64, DEFINITION)
        self.job.workspace = self.root / "workspace"
        self.job.scratch = self.root / "scratch"
        for area in ("input", "runtime", "invocations"):
            (self.job.workspace / area).mkdir(parents=True)
        (self.job.scratch / "output").mkdir(parents=True)

    def tearDown(self):
        self.temp.cleanup()

    def write(self, path, content=b"test"):
        return upload(self.job, [{"path": path, "contentBase64": base64.b64encode(content).decode()}])[0]

    def test_only_known_absolute_file_areas_are_accessible(self):
        for path in ["input/a", "/etc/passwd", "/workspace/input/../a", "/workspace/input//a", "/workspace/input/a/", "/workspace/input/a\\b", "/workspace/input/a\x00", "/workspace/output/a"]:
            with self.subTest(path=path):
                self.assertEqual(self.write(path)["error"], "invalid_path")
        self.assertIsNone(self.write("/workspace/input/a")["error"])

    def test_uploads_are_atomic_immutable_and_sealed_before_execution(self):
        self.assertIsNone(self.write("/workspace/input/a")["error"])
        self.assertIsNotNone(self.write("/workspace/input/a", b"changed")["error"])
        self.assertEqual((self.job.workspace / "input/a").read_bytes(), b"test")
        self.job.sealed = True
        self.assertIsNotNone(self.write("/workspace/input/b")["error"])
        self.assertIsNotNone(self.write("/workspace/runtime/action/a")["error"])
        self.assertIsNone(self.write("/workspace/invocations/call_1.json")["error"])
        self.assertIsNotNone(self.write("/workspace/invocations/nested/call.json")["error"])

    def test_symlinked_parents_and_destinations_do_not_escape(self):
        outside = self.root / "private"
        outside.mkdir()
        secret = outside / "secret"
        secret.write_text("private")
        (self.job.workspace / "input/link").symlink_to(outside, target_is_directory=True)
        (self.job.workspace / "input/secret").symlink_to(secret)
        self.assertIsNotNone(self.write("/workspace/input/link/secret")["error"])
        self.assertIsNotNone(self.write("/workspace/input/secret")["error"])
        self.assertEqual(secret.read_text(), "private")

    def test_downloads_reject_symlinks_hardlinks_and_non_regular_files(self):
        import os
        self.job.finished.set()
        output = self.job.scratch / "output"
        (output / "real").write_text("ok")
        (output / "symlink").symlink_to(output / "real")
        os.link(output / "real", output / "hardlink")
        os.mkfifo(output / "fifo")
        (output / "dir").mkdir()
        for name in ["symlink", "hardlink", "fifo", "dir"]:
            with self.subTest(name=name):
                result = download(self.job, [f"/workspace/output/{name}"])[0]
                self.assertIsNotNone(result["error"])
                self.assertIsNone(result["contentBase64"])
        (output / "valid").write_text("正常")
        result = download(self.job, ["/workspace/output/valid"])[0]
        self.assertEqual(base64.b64decode(result["contentBase64"]).decode(), "正常")

    def test_outputs_cannot_be_read_while_a_process_can_mutate_them(self):
        with self.assertRaises(runner.RunnerError):
            download(self.job, ["/workspace/output/any"])

    def test_cancelled_runtime_rejects_late_invocation_uploads(self):
        self.job.cancelled.set()
        with self.assertRaises(runner.RunnerError):
            self.write("/workspace/invocations/call_1.json")

    def test_inputs_remain_readable_to_the_jail_with_a_restrictive_runner_umask(self):
        import os
        previous = os.umask(0o077)
        try:
            self.assertIsNone(self.write('/workspace/input/nested/file')["error"])
        finally:
            os.umask(previous)
        self.assertEqual((self.job.workspace / 'input/nested').stat().st_mode & 0o777, 0o755)
        self.assertEqual((self.job.workspace / 'input/nested/file').stat().st_mode & 0o777, 0o444)

    def test_download_budget_is_aggregate(self):
        self.job.finished.set()
        for name in ["a", "b"]:
            (self.job.scratch / "output" / name).write_bytes(b"1234")
        with mock.patch("compute_storage.MAX_FILE_BYTES", 6):
            result = download(self.job, ["/workspace/output/a", "/workspace/output/b"])
        self.assertIsNone(result[0]["error"])
        self.assertIsNotNone(result[1]["error"])


class ComputePolicyTest(unittest.TestCase):
    def service(self):
        service = ComputeService.__new__(ComputeService)
        service.definition = DEFINITION
        service.jobs = {}
        service.control = mock.Mock()
        service.lock = threading.RLock()
        service.health = mock.Mock(return_value={"available": True})
        return service

    def test_create_rejects_commands_paths_and_policy_downgrades_before_allocation(self):
        service = self.service()
        with mock.patch("compute_service.ComputeJob") as job:
            for key in ["command", "workspacePath", "networkPolicy", "image"]:
                with self.subTest(key=key), self.assertRaises(runner.RunnerError):
                    service.create({"runtimeId": "a" * 64, "definition": DEFINITION, key: "untrusted"})
            modified = {**DEFINITION, "resources": {**DEFINITION["resources"], "memoryMb": 9999}}
            with self.assertRaises(runner.RunnerError):
                service.create({"runtimeId": "a" * 64, "definition": modified})
            job.assert_not_called()

    def test_an_existing_job_is_never_reattached_for_a_second_execution(self):
        service = self.service()
        service.jobs["a" * 64] = object()
        with self.assertRaisesRegex(runner.RunnerError, "already exists"):
            service.create({"runtimeId": "a" * 64, "definition": DEFINITION})

    def test_destroy_missing_is_idempotent_but_rejects_path_injection(self):
        service = self.service()
        service.destroy("a" * 64)
        with self.assertRaises(runner.RunnerError):
            service.destroy("../private")

    def test_reaper_retries_failed_cleanup_and_removes_abandoned_jobs(self):
        service = self.service()
        job = mock.Mock(deadline=10)
        service.jobs["a" * 64] = job
        job.destroy.side_effect = [RuntimeError("busy"), None]
        with mock.patch("compute_service.time.monotonic", return_value=71):
            service.reap()
            self.assertIn("a" * 64, service.jobs)
            service.reap()
        self.assertEqual(service.jobs, {})

    def test_recovery_refuses_unowned_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / ("a" * 64)
            root.mkdir()
            (root / "owner.json").write_text(json.dumps({"version": 1, "cgroup": "../../private"}))
            with self.assertRaises(RuntimeError):
                ComputeJob.recover(root, DEFINITION)
            self.assertTrue(root.is_dir())


if __name__ == "__main__":
    unittest.main()
