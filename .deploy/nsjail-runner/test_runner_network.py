import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock

import runner


class TmpfsSizingTest(unittest.TestCase):
    def test_tmpfs_size_is_configurable_without_changing_run_or_resource_limits(self):
        runtime = runner.Runtime('a' * 32, pathlib.Path('/sandbox/test'), '/workspace')
        with mock.patch.object(runner, 'TMPFS_MB', 64):
            args = runner.nsjail_args(runtime, 'true')
        self.assertIn('none:/tmp:tmpfs:size=67108864,mode=1777', args)
        self.assertEqual(args[args.index('--tmpfsmount') + 1], '/run')
        self.assertEqual(args[args.index('--rlimit_fsize') + 1], str(runner.RLIMIT_FSIZE_MB))

    def test_startup_rejects_unbounded_or_negative_tmpfs_capacity(self):
        for size in (0, -1):
            with self.subTest(size=size), mock.patch.object(runner, 'TMPFS_MB', size), \
                    mock.patch.object(runner, 'RUNNER_TOKEN', 'unit-test'):
                with self.assertRaisesRegex(SystemExit, 'TMPFS_MB'):
                    runner.ensure_startup_invariants()


class RunnerNetworkLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = pathlib.Path(self.directory.name)
        self.runtime = runner.Runtime('a' * 32, self.root, '/workspace')
        self.addCleanup(self.runtime.destroy)
        self.lease = mock.Mock()
        self.manager = mock.patch.object(runner, 'NETWORK').start()
        self.manager.acquire.return_value = self.lease
        mock.patch.object(runner, 'USE_CGROUP_V2', False).start()
        mock.patch.object(runner, 'STATE_ROOT', self.root / 'state').start()
        self.addCleanup(mock.patch.stopall)

    def test_execute_releases_network_after_process_creation_failure(self):
        with mock.patch.object(runner.subprocess, 'Popen', side_effect=OSError('fork failed')):
            with self.assertRaises(OSError):
                runner.execute_command(self.runtime, 'true', 1000, 1024)
        self.lease.close.assert_called_once()
        self.assertEqual(self.runtime.active_executions, 0)

    def test_execute_passes_lease_and_releases_it_after_completion(self):
        with mock.patch.object(runner, 'nsjail_args', return_value=['/bin/sh', '-c', 'printf connected']) as args:
            result = runner.execute_command(self.runtime, 'command', 1000, 1024)
        self.assertEqual(result['output'], 'connected')
        self.assertIs(args.call_args.kwargs['network'], self.lease)
        self.lease.close.assert_called_once()

    def test_execute_timeout_releases_network(self):
        with mock.patch.object(runner, 'nsjail_args', return_value=['/bin/sleep', '30']):
            result = runner.execute_command(self.runtime, 'command', 50, 1024)
        self.assertTrue(result['timedOut'])
        self.lease.close.assert_called_once()

    def test_terminal_fork_failure_releases_network_and_reservation(self):
        with mock.patch.object(runner.pty, 'fork', side_effect=OSError('fork failed')):
            with self.assertRaises(OSError):
                runner.open_terminal(self.runtime, {'cols': 80, 'rows': 24})
        self.lease.close.assert_called_once()
        self.assertFalse(self.runtime.starting_terminal_ids)

    def test_service_start_failure_releases_network_and_reservation(self):
        with mock.patch.object(runner.subprocess, 'Popen', side_effect=OSError('fork failed')):
            with self.assertRaises(OSError):
                runner.start_service(self.runtime, {'serviceId': 'web', 'command': 'true', 'cwd': '/workspace'})
        self.lease.close.assert_called_once()
        self.assertFalse(self.runtime.starting_service_ids)

    def test_service_natural_exit_closes_network_without_waiting_for_runtime_destruction(self):
        process = subprocess.Popen(['/bin/sh', '-c', 'exit 0'])
        process.wait()
        service = runner.Service('web', process, self.root / 'stdout', self.root / 'stderr', None,
                                 runner.utc_now(), network=self.lease)
        service.refresh()
        self.lease.close.assert_called_once()

    def test_egress_setup_failure_never_launches_an_unrestricted_process(self):
        self.manager.acquire.side_effect = RuntimeError('network failed')
        with mock.patch.object(runner.subprocess, 'Popen') as process:
            with self.assertRaises(RuntimeError):
                runner.execute_command(self.runtime, 'true', 1000, 1024)
            process.assert_not_called()
        self.assertEqual(self.runtime.active_executions, 0)


if __name__ == '__main__':
    unittest.main()
