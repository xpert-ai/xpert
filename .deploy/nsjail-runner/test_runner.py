import base64
import io
import os
import pathlib
import subprocess
import tempfile
import threading
import unittest
from http import HTTPStatus
from unittest import mock

import runner


class RunnerStateRootSafetyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary_directory.name)
        self.state_base = self.root / "var" / "lib" / "xpert-nsjail"
        self.workspace_root = self.root / "sandbox"
        self.rootfs = self.root / "rootfs"
        self.workspace_root.mkdir()
        self.rootfs.mkdir()
        self.patchers = [
            mock.patch.object(runner, "STATE_ROOT_BASE", self.state_base),
            mock.patch.object(runner, "WORKSPACE_ROOT", self.workspace_root),
            mock.patch.object(runner, "ROOTFS", self.rootfs),
        ]
        for patcher in self.patchers:
            patcher.start()

    def tearDown(self) -> None:
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.temporary_directory.cleanup()

    def test_initializes_an_empty_owned_state_root(self) -> None:
        with mock.patch.object(runner, "STATE_ROOT", self.state_base):
            runner.initialize_state_root()

        self.assertEqual(
            (self.state_base / runner.STATE_MARKER_NAME).read_text(),
            runner.STATE_MARKER_CONTENT,
        )

    def test_refuses_a_state_root_outside_the_dedicated_base(self) -> None:
        unsafe_root = self.root / "unrelated"

        with mock.patch.object(runner, "STATE_ROOT", unsafe_root):
            with self.assertRaisesRegex(SystemExit, "State root must be"):
                runner.initialize_state_root()

        self.assertFalse(unsafe_root.exists())

    def test_refuses_a_state_root_that_overlaps_the_workspace(self) -> None:
        with (
            mock.patch.object(runner, "STATE_ROOT_BASE", self.workspace_root),
            mock.patch.object(runner, "STATE_ROOT", self.workspace_root),
        ):
            with self.assertRaisesRegex(SystemExit, "overlaps a protected path"):
                runner.initialize_state_root()

    def test_refuses_to_clear_an_unmarked_non_empty_directory(self) -> None:
        self.state_base.mkdir(parents=True)
        protected_file = self.state_base / "not-runner-state.txt"
        protected_file.write_text("keep")

        with mock.patch.object(runner, "STATE_ROOT", self.state_base):
            with self.assertRaisesRegex(SystemExit, "unmarked state root"):
                runner.initialize_state_root()

        self.assertEqual(protected_file.read_text(), "keep")

    def test_clears_only_a_valid_marked_state_root(self) -> None:
        self.state_base.mkdir(parents=True)
        (self.state_base / runner.STATE_MARKER_NAME).write_text(runner.STATE_MARKER_CONTENT)
        stale_directory = self.state_base / "runtime"
        stale_directory.mkdir()
        (stale_directory / "stdout.log").write_text("stale")

        with mock.patch.object(runner, "STATE_ROOT", self.state_base):
            runner.initialize_state_root()

        self.assertFalse(stale_directory.exists())
        self.assertEqual(
            (self.state_base / runner.STATE_MARKER_NAME).read_text(),
            runner.STATE_MARKER_CONTENT,
        )


class RunnerCgroupCleanupTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.cgroup_root = pathlib.Path(self.temporary_directory.name)
        self.patcher = mock.patch.object(runner, "CGROUP_ROOT", self.cgroup_root)
        self.patcher.start()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.temporary_directory.cleanup()

    def create_cgroup(self, name: str, procs: str = "") -> pathlib.Path:
        path = self.cgroup_root / name
        path.mkdir()
        (path / "cgroup.procs").write_text(procs)
        return path

    def test_removes_only_an_empty_owned_cgroup(self) -> None:
        path = self.create_cgroup("NSJAIL.123")

        with mock.patch.object(pathlib.Path, "rmdir") as rmdir:
            self.assertTrue(runner.remove_empty_nsjail_cgroup(path, retries=1))

        rmdir.assert_called_once_with()

    def test_keeps_an_active_owned_cgroup(self) -> None:
        path = self.create_cgroup("NSJAIL.123", "456\n")

        with mock.patch.object(pathlib.Path, "rmdir") as rmdir:
            self.assertFalse(runner.remove_empty_nsjail_cgroup(path, retries=1))

        rmdir.assert_not_called()

    def test_ignores_unowned_cgroup_names(self) -> None:
        path = self.create_cgroup("OTHER.123")

        with mock.patch.object(pathlib.Path, "rmdir") as rmdir:
            self.assertFalse(runner.remove_empty_nsjail_cgroup(path, retries=1))

        rmdir.assert_not_called()

    def test_cgroup_pid_limit_is_not_conflated_with_rlimit_nproc(self) -> None:
        runtime = runner.Runtime("a" * 32, self.cgroup_root, "/workspace")

        with mock.patch.object(runner, "USE_CGROUP_V2", True):
            args = runner.nsjail_args(runtime, "true")

        self.assertEqual(args[args.index("--rlimit_nproc") + 1], "max")
        self.assertEqual(args[args.index("--cgroup_pids_max") + 1], str(runner.PIDS_LIMIT))


class RunnerFileBoundaryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary_directory.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.runtime = runner.Runtime("a" * 32, self.workspace, "/workspace")
        self.ownership_patchers = [
            mock.patch.object(runner, "JAIL_UID", os.geteuid()),
            mock.patch.object(runner, "JAIL_GID", os.getegid()),
        ]
        for patcher in self.ownership_patchers:
            patcher.start()

    def tearDown(self) -> None:
        with runner.RUNTIMES_LOCK:
            runtimes = list(runner.RUNTIMES.values())
            runner.RUNTIMES.clear()
        for runtime in runtimes:
            runtime.destroy()
        for patcher in reversed(self.ownership_patchers):
            patcher.stop()
        self.temporary_directory.cleanup()

    def test_upload_and_download_regular_file(self) -> None:
        content = base64.b64encode(b"sandbox-file").decode()

        self.assertEqual(
            runner.upload_file(self.runtime, "/workspace/nested/file.txt", content),
            {"error": None, "path": "/workspace/nested/file.txt"},
        )
        self.assertEqual(
            runner.download_file(self.runtime, "/workspace/nested/file.txt"),
            {"contentBase64": content, "error": None, "path": "/workspace/nested/file.txt"},
        )
        nested = self.workspace / "nested"
        uploaded = nested / "file.txt"
        self.assertEqual((nested.stat().st_uid, nested.stat().st_gid), (os.geteuid(), os.getegid()))
        self.assertEqual((uploaded.stat().st_uid, uploaded.stat().st_gid), (os.geteuid(), os.getegid()))
        with uploaded.open("ab") as target:
            target.write(b"-editable")
        self.assertEqual(uploaded.read_bytes(), b"sandbox-file-editable")

    def test_download_rejects_too_many_paths(self) -> None:
        with mock.patch.object(runner, "MAX_DOWNLOAD_FILES", 1):
            with self.assertRaises(runner.RunnerError) as context:
                runner.download_files(self.runtime, ["one", "two"])

        self.assertEqual(context.exception.status, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)

    def test_download_rejects_aggregate_bytes_including_duplicate_paths(self) -> None:
        path = self.workspace / "file.txt"
        path.write_bytes(b"123456")

        with mock.patch.object(runner, "MAX_DOWNLOAD_BYTES", 10):
            with self.assertRaises(runner.RunnerError) as context:
                runner.download_files(self.runtime, ["file.txt", "file.txt"])

        self.assertEqual(context.exception.status, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)

    def test_file_channel_rejects_symlink(self) -> None:
        outside = self.root / "outside.txt"
        outside.write_text("outside")
        (self.workspace / "link.txt").symlink_to(outside)

        result = runner.download_file(self.runtime, "/workspace/link.txt")

        self.assertEqual(result["error"], "invalid_path")
        self.assertIsNone(result["contentBase64"])

    def test_file_channel_rejects_hardlink_without_modifying_target(self) -> None:
        outside = self.root / "outside.txt"
        outside.write_text("outside")
        os.link(outside, self.workspace / "link.txt")

        download = runner.download_file(self.runtime, "/workspace/link.txt")
        upload = runner.upload_file(
            self.runtime,
            "/workspace/link.txt",
            base64.b64encode(b"changed").decode(),
        )

        self.assertEqual(download["error"], "invalid_path")
        self.assertIsNone(download["contentBase64"])
        self.assertEqual(upload["error"], "permission_denied")
        self.assertEqual(outside.read_text(), "outside")

    def test_file_channel_rejects_parent_traversal(self) -> None:
        result = runner.download_file(self.runtime, "/workspace/../outside.txt")

        self.assertEqual(result["error"], "invalid_path")
        self.assertIsNone(result["contentBase64"])

    def test_runtime_destroy_terminates_tracked_execution(self) -> None:
        process = subprocess.Popen(["sleep", "30"], start_new_session=True)
        self.runtime.track_process(process)

        self.runtime.destroy()

        self.assertIsNotNone(process.poll())

    def test_idle_runtime_is_reaped_after_two_hours(self) -> None:
        self.runtime.last_activity_at = 100
        with runner.RUNTIMES_LOCK:
            runner.RUNTIMES[self.runtime.runtime_id] = self.runtime

        reaped = runner.reap_idle_runtimes(now=100 + 7201, idle_ttl_seconds=7200)

        self.assertEqual(reaped, 1)
        self.assertTrue(self.runtime.destroyed)
        self.assertNotIn(self.runtime.runtime_id, runner.RUNTIMES)

    def test_running_service_prevents_idle_runtime_reaping(self) -> None:
        process = subprocess.Popen(["sleep", "30"], start_new_session=True)
        service = runner.Service("service", process, self.root / "stdout.log", self.root / "stderr.log", None, runner.utc_now())
        self.runtime.services[service.service_id] = service
        self.runtime.last_activity_at = 100
        with runner.RUNTIMES_LOCK:
            runner.RUNTIMES[self.runtime.runtime_id] = self.runtime

        reaped = runner.reap_idle_runtimes(now=100 + 7201, idle_ttl_seconds=7200)

        self.assertEqual(reaped, 0)
        self.assertIn(self.runtime.runtime_id, runner.RUNTIMES)

    def test_final_terminal_event_releases_runtime_slot(self) -> None:
        class ExitedTerminal:
            terminal_id = "terminal"

            def drain(self) -> dict[str, object]:
                return {"exitCode": 0, "exited": True, "output": "", "signal": None}

        terminal = ExitedTerminal()
        self.runtime.terminals[terminal.terminal_id] = terminal

        event = runner.drain_terminal_event(self.runtime, terminal)

        self.assertTrue(event["exited"])
        self.assertNotIn(terminal.terminal_id, self.runtime.terminals)

    def test_service_start_reservation_rejects_same_id(self) -> None:
        runner.reserve_service_start(self.runtime, "service")

        with self.assertRaises(runner.RunnerError) as context:
            runner.reserve_service_start(self.runtime, "service")

        self.assertEqual(context.exception.status, HTTPStatus.CONFLICT)

    def test_stopped_services_do_not_consume_active_service_limit(self) -> None:
        class StoppedProcess:
            returncode = 0

            def poll(self) -> int:
                return 0

        for index in range(runner.MAX_SERVICES_PER_RUNTIME):
            service_id = f"stopped-{index}"
            self.runtime.services[service_id] = runner.Service(
                service_id,
                StoppedProcess(),
                self.root / f"{service_id}.stdout.log",
                self.root / f"{service_id}.stderr.log",
                None,
                runner.utc_now(),
            )

        runner.reserve_service_start(self.runtime, "new-service")

        self.assertIn("new-service", self.runtime.starting_service_ids)


class RunnerExecutionLimitTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        root = pathlib.Path(self.temporary_directory.name)
        self.runtime_a = runner.Runtime("a" * 32, root, "/workspace")
        self.runtime_b = runner.Runtime("b" * 32, root, "/workspace")
        with runner.EXECUTIONS_LOCK:
            runner.ACTIVE_EXECUTIONS_GLOBAL = 0

    def tearDown(self) -> None:
        with runner.EXECUTIONS_LOCK:
            runner.ACTIVE_EXECUTIONS_GLOBAL = 0
        self.temporary_directory.cleanup()

    def test_runtime_limit_rejects_a_concurrent_execution_before_process_start(self) -> None:
        entered = threading.Event()
        release = threading.Event()

        def hold_slot() -> None:
            with runner.execution_slot(self.runtime_a):
                entered.set()
                release.wait(timeout=2)

        with (
            mock.patch.object(runner, "MAX_EXECUTIONS_GLOBAL", 2),
            mock.patch.object(runner, "MAX_EXECUTIONS_PER_RUNTIME", 1),
        ):
            thread = threading.Thread(target=hold_slot)
            thread.start()
            self.assertTrue(entered.wait(timeout=1))
            with self.assertRaises(runner.RunnerError) as context:
                runner.execute_command(self.runtime_a, "true", 1000, 1024)
            release.set()
            thread.join(timeout=2)

        self.assertEqual(context.exception.status, HTTPStatus.TOO_MANY_REQUESTS)
        self.assertEqual(self.runtime_a.active_executions, 0)
        self.assertEqual(runner.ACTIVE_EXECUTIONS_GLOBAL, 0)

    def test_global_limit_applies_across_runtimes(self) -> None:
        with (
            mock.patch.object(runner, "MAX_EXECUTIONS_GLOBAL", 1),
            mock.patch.object(runner, "MAX_EXECUTIONS_PER_RUNTIME", 1),
            runner.execution_slot(self.runtime_a),
        ):
            with self.assertRaises(runner.RunnerError) as context:
                with runner.execution_slot(self.runtime_b):
                    self.fail("global execution limit was not enforced")

        self.assertEqual(context.exception.status, HTTPStatus.TOO_MANY_REQUESTS)
        self.assertEqual(self.runtime_b.active_executions, 0)

    def test_process_start_failure_releases_execution_slots(self) -> None:
        with mock.patch.object(runner.subprocess, "Popen", side_effect=OSError("fork failed")):
            with self.assertRaisesRegex(OSError, "fork failed"):
                runner.execute_command(self.runtime_a, "true", 1000, 1024)

        self.assertEqual(self.runtime_a.active_executions, 0)
        self.assertEqual(runner.ACTIVE_EXECUTIONS_GLOBAL, 0)


class RunnerTerminalReservationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.runtime = runner.Runtime(
            "a" * 32,
            pathlib.Path(self.temporary_directory.name),
            "/workspace",
        )

    def tearDown(self) -> None:
        self.runtime.destroy()
        self.temporary_directory.cleanup()

    def test_concurrent_terminal_open_is_rejected_before_a_second_fork(self) -> None:
        fork_entered = threading.Event()
        release_fork = threading.Event()
        errors: list[Exception] = []

        def blocked_fork() -> tuple[int, int]:
            fork_entered.set()
            release_fork.wait(timeout=2)
            raise OSError("fork failed")

        def open_first() -> None:
            try:
                runner.open_terminal(self.runtime, {"cols": 80, "rows": 24})
            except Exception as error:
                errors.append(error)

        with (
            mock.patch.object(runner, "MAX_TERMINALS_PER_RUNTIME", 1),
            mock.patch.object(runner.pty, "fork", side_effect=blocked_fork) as fork,
        ):
            thread = threading.Thread(target=open_first)
            thread.start()
            self.assertTrue(fork_entered.wait(timeout=1))
            with self.assertRaises(runner.RunnerError) as context:
                runner.open_terminal(self.runtime, {"cols": 80, "rows": 24})
            release_fork.set()
            thread.join(timeout=2)

        self.assertEqual(context.exception.status, HTTPStatus.TOO_MANY_REQUESTS)
        self.assertEqual(fork.call_count, 1)
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], OSError)
        self.assertFalse(self.runtime.starting_terminal_ids)


class RunnerManagedServiceSafetyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary_directory.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.state_root = self.root / "state"
        self.runtime = runner.Runtime("a" * 32, self.workspace, "/workspace")
        self.state_root_patcher = mock.patch.object(runner, "STATE_ROOT", self.state_root)
        self.state_root_patcher.start()

    def tearDown(self) -> None:
        self.runtime.destroy()
        self.state_root_patcher.stop()
        self.temporary_directory.cleanup()

    def create_service(self, service_id: str = "service") -> runner.Service:
        stdout_path, stderr_path = runner.prepare_service_logs(self.runtime, service_id)
        process = subprocess.Popen(["sleep", "30"], start_new_session=True)
        service = runner.Service(service_id, process, stdout_path, stderr_path, None, runner.utc_now())
        self.runtime.services[service_id] = service
        return service

    def test_readiness_text_is_literal_and_not_a_python_regex(self) -> None:
        service = self.create_service()
        service.stdout_path.write_text("service is aaaa")

        self.assertFalse(runner.logs_match(service, "a+"))
        service.stdout_path.write_text("service emitted a+")
        self.assertTrue(runner.logs_match(service, "a+"))

    def test_concurrent_same_id_start_and_destroy_leave_no_process(self) -> None:
        process_started = threading.Event()
        release_discovery = threading.Event()
        created_processes: list[subprocess.Popen[bytes]] = []
        start_errors: list[Exception] = []
        real_popen = subprocess.Popen

        def capture_process(*args: object, **kwargs: object) -> subprocess.Popen[bytes]:
            process = real_popen(*args, **kwargs)
            created_processes.append(process)
            return process

        def block_cgroup_discovery(_process_id: int, *, retries: int = 20) -> tuple[pathlib.Path, ...]:
            del retries
            process_started.set()
            release_discovery.wait(timeout=2)
            return ()

        payload = {
            "command": "sleep 30",
            "cwd": "/workspace",
            "env": [],
            "port": None,
            "readyPattern": None,
            "serviceId": "service",
        }

        def start_first() -> None:
            try:
                runner.start_service(self.runtime, payload)
            except Exception as error:
                start_errors.append(error)

        with (
            mock.patch.object(runner, "nsjail_args", return_value=["/bin/sleep", "30"]),
            mock.patch.object(runner.subprocess, "Popen", side_effect=capture_process),
            mock.patch.object(runner, "discover_nsjail_cgroups", side_effect=block_cgroup_discovery),
        ):
            thread = threading.Thread(target=start_first)
            thread.start()
            self.assertTrue(process_started.wait(timeout=1))

            with self.assertRaises(runner.RunnerError) as context:
                runner.start_service(self.runtime, payload)

            self.runtime.destroy()
            release_discovery.set()
            thread.join(timeout=3)

        self.assertEqual(context.exception.status, HTTPStatus.CONFLICT)
        self.assertFalse(thread.is_alive())
        self.assertEqual(len(start_errors), 1)
        self.assertIsInstance(start_errors[0], runner.RunnerError)
        self.assertEqual(getattr(start_errors[0], "status", None), HTTPStatus.NOT_FOUND)
        self.assertTrue(created_processes)
        self.assertTrue(all(process.poll() is not None for process in created_processes))
        self.assertFalse(self.runtime.services)
        self.assertFalse(self.runtime.starting_service_ids)

    def test_readiness_text_uses_a_utf8_byte_limit_before_starting(self) -> None:
        with (
            mock.patch.object(runner, "MAX_READY_TEXT_BYTES", 3),
            mock.patch.object(runner.subprocess, "Popen") as popen,
        ):
            with self.assertRaisesRegex(runner.RunnerError, "literal text limit"):
                runner.start_service(
                    self.runtime,
                    {
                        "command": "sleep 30",
                        "cwd": "/workspace",
                        "env": [],
                        "port": None,
                        "readyPattern": "éé",
                        "serviceId": "service",
                    },
                )

        popen.assert_not_called()

    def test_preparing_a_restart_removes_stale_readiness_logs(self) -> None:
        stdout_path, stderr_path = runner.prepare_service_logs(self.runtime, "service")
        stdout_path.write_text("READY FROM OLD PROCESS")
        stderr_path.write_text("old error")

        restarted_stdout, restarted_stderr = runner.prepare_service_logs(self.runtime, "service")

        self.assertEqual(restarted_stdout.read_bytes(), b"")
        self.assertEqual(restarted_stderr.read_bytes(), b"")

    def test_stopping_a_service_removes_runtime_state_and_logs(self) -> None:
        service = self.create_service()
        service.stdout_path.write_text("output")

        state = runner.remove_service(self.runtime, service)

        self.assertEqual(state["status"], "stopped")
        self.assertNotIn(service.service_id, self.runtime.services)
        self.assertFalse(service.stdout_path.parent.exists())

    def test_service_log_copy_keeps_disk_usage_bounded(self) -> None:
        path = self.root / "bounded.log"
        with mock.patch.object(runner, "MAX_SERVICE_LOG_BYTES", 8):
            runner.copy_bounded_log(io.BytesIO(b"0123456789"), path)

        self.assertEqual(path.read_bytes(), b"23456789")


if __name__ == "__main__":
    unittest.main()
