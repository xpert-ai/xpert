"""Local services can be restarted after a finite task reaps its descendants.

Use real Linux Supervisor/HTTP processes without a host broker or model call.
The task fixture simulates executor cleanup; it does not change that policy.
"""
import ctypes
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest

from processes import control, healthy, identity, service_pid, start_supervisor


def finite_task(config):
    if ctypes.CDLL(None).prctl(36, 1, 0, 0, 0):
        raise RuntimeError('Task cleanup fixture requires Linux subreaper support')
    try:
        start_supervisor(config)
        control(config, 'start', 'api')
        deadline = time.monotonic() + 8
        while not healthy(config, 'api'):
            if time.monotonic() >= deadline:
                raise RuntimeError('Local HTTP service did not become ready')
            time.sleep(.05)
        saved = json.loads((Path(config['state']) / 'supervisor-identity.json').read_text())
        print(json.dumps({'supervisorPid': saved['pid'], 'apiPid': service_pid(config, 'api')}), flush=True)
    finally:
        # Only this test task's adopted descendants are reaped, including daemons.
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            for child in Path(f'/proc/self/task/{os.getpid()}/children').read_text().split():
                try:
                    os.kill(int(child), signal.SIGKILL)
                except ProcessLookupError:
                    pass
            try:
                while os.waitpid(-1, os.WNOHANG)[0]:
                    pass
            except ChildProcessError:
                break
            time.sleep(.02)
        else:
            raise RuntimeError('Task descendants were not fully reaped')


@unittest.skipUnless(sys.platform == 'linux' and shutil.which('supervisord'), 'Linux Supervisor integration')
class TaskLifetimeTests(unittest.TestCase):
    def test_new_task_restarts_same_instance_after_task_cleanup(self):
        with tempfile.TemporaryDirectory(prefix='local-task-') as folder:
            root = Path(folder)
            (root / 'logs').mkdir()
            candidate = root / 'candidate.txt'
            candidate.write_text('unchanged candidate and project state')
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', 0))
                port = probe.getsockname()[1]
            (root / 'service.py').write_text(
                'from http.server import BaseHTTPRequestHandler, HTTPServer\n'
                'class Health(BaseHTTPRequestHandler):\n'
                ' def do_GET(self):\n'
                '  self.send_response(200); self.end_headers(); self.wfile.write(b"ok")\n'
                ' def log_message(self, *args): pass\n'
                f'HTTPServer(("127.0.0.1", {port}), Health).serve_forever()\n'
            )
            config = {'state': folder, 'platform': folder, 'scripts': folder,
                      'supervisorMode': 'detached', 'python': sys.executable,
                      'supervisord': shutil.which('supervisord'),
                      'supervisorctl': shutil.which('supervisorctl'), 'ports': {'api': port}}
            receipts = []
            for _ in range(2):
                result = subprocess.run([sys.executable, __file__, 'task', json.dumps(config)],
                                        capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr)
                receipt = json.loads(result.stdout)
                receipts.append(receipt)
                self.assertIsNone(identity(receipt['supervisorPid']))
                self.assertIsNone(identity(receipt['apiPid']))
                self.assertEqual(candidate.read_text(), 'unchanged candidate and project state')
            self.assertNotEqual(receipts[0]['supervisorPid'], receipts[1]['supervisorPid'])


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'task':
        finite_task(json.loads(sys.argv[2]))
    else:
        unittest.main()
