import unittest
from pathlib import Path
import shutil
import socket
import sys
import tempfile
from unittest.mock import patch
from platform_services import infrastructure
from processes import ServicePending, healthy, launch_supervisor, service_pid, start_service, stop
from progress import read_progress


class ServiceWaitingTests(unittest.TestCase):
    def test_infrastructure_shares_one_readiness_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            (state / 'postgres').mkdir()
            (state / 'postgres/PG_VERSION').write_text('17')
            (state / 'database-initialization.json').write_text('{}')
            config = {'state': directory, 'runtime': directory}
            with patch('platform_services.start_supervisor'), patch('platform_services.sql', return_value='1'), \
                 patch('platform_services.time.monotonic', side_effect=[0, 10, 61]), \
                 patch('platform_services.start_service') as start:
                infrastructure(config, 60)
            self.assertEqual(start.call_args_list[0].args, (config, 'postgres', 50))
            self.assertEqual(start.call_args_list[1].args, (config, 'redis', 0))

    def test_unowned_listener_is_not_healthy(self):
        with patch('processes.service_pid', return_value=0), patch('processes.owns_listener', return_value=False):
            self.assertFalse(healthy({'ports': {'api': 3001}}, 'api'))

    def test_wait_expiry_preserves_owned_process_without_restart(self):
        with patch('processes.healthy', return_value=False), patch('processes.service_pid', return_value=123), \
             patch('processes.time.monotonic', side_effect=[0, 0, 3]), patch('processes.time.sleep'), \
             patch('processes.control') as control:
            with self.assertRaises(ServicePending) as pending:
                start_service({'state': '/state'}, 'web', 2)
        self.assertEqual((pending.exception.service, pending.exception.pid), ('web', 123))
        control.assert_not_called()

    def test_expired_operation_does_not_start_the_next_service(self):
        with patch('processes.healthy', return_value=False), patch('processes.service_pid', return_value=0), \
             patch('processes.control') as control:
            with self.assertRaises(ServicePending) as pending:
                start_service({'state': '/state'}, 'api', 0)
        self.assertEqual(pending.exception.pid, 0)
        control.assert_not_called()

    def test_exited_service_is_failure_not_pending(self):
        with patch('processes.healthy', return_value=False), patch('processes.service_pid', side_effect=[123, 0]), \
             patch('processes.time.monotonic', side_effect=[0, 0]):
            with self.assertRaisesRegex(RuntimeError, 'exited') as failure:
                start_service({'state': '/state'}, 'api', 2)
        self.assertNotIsInstance(failure.exception, ServicePending)


@unittest.skipUnless(sys.platform == 'linux' and shutil.which('supervisord'), 'Linux Supervisor integration')
class LiveWaitingTests(unittest.TestCase):
    def test_short_wait_then_resume_keeps_same_process_and_progress(self):
        with tempfile.TemporaryDirectory(prefix='local-wait-') as folder:
            root = Path(folder)
            (root / 'logs').mkdir()
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', 0))
                port = probe.getsockname()[1]
            (root / 'service.py').write_text(
                'import sys, time\nfrom pathlib import Path\n'
                f'sys.path.insert(0, {str(Path(__file__).parent)!r})\n'
                'from progress import emit\n'
                'from http.server import BaseHTTPRequestHandler, HTTPServer\n'
                'emit("build", "running")\n'
                f'while not Path({str(root / "ready")!r}).exists(): time.sleep(.05)\n'
                'class Health(BaseHTTPRequestHandler):\n'
                ' def do_GET(self):\n'
                '  self.send_response(200); self.end_headers(); self.wfile.write(b"ok")\n'
                ' def log_message(self, *args): pass\n'
                'emit("serve", "running")\n'
                f'HTTPServer(("127.0.0.1", {port}), Health).serve_forever()\n'
            )
            config = {'state': folder, 'platform': folder, 'scripts': folder,
                      'python': sys.executable, 'ports': {'api': port},
                      'supervisord': shutil.which('supervisord'), 'supervisorctl': shutil.which('supervisorctl')}
            owner = launch_supervisor(config, foreground=True)
            try:
                with self.assertRaises(ServicePending) as pending:
                    start_service(config, 'api', 1)
                pid = pending.exception.pid
                self.assertGreater(pid, 0)
                self.assertEqual(read_progress(config, 'api')['lastPhase']['phase'], 'build')
                (root / 'ready').touch()
                start_service(config, 'api', 15)
                self.assertEqual(service_pid(config, 'api'), pid)
                self.assertTrue(healthy(config, 'api'))
                self.assertEqual(read_progress(config, 'api')['lastPhase']['phase'], 'serve')
            finally:
                stop(config)
                if owner.poll() is None:
                    owner.terminate()
                owner.wait(timeout=30)


if __name__ == '__main__':
    unittest.main()
