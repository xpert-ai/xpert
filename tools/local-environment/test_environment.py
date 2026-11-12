import argparse
from concurrent.futures import ProcessPoolExecutor
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

from configuration import finish_prepare, prepare, read_env
from processes import assert_port_free, identity, launch_supervisor, owns_listener, owns_supervisor, redacted_tail, start_supervisor, stop
from runtime import atomic_json, download, lock_file


def increment(path):
    path = Path(path)
    with lock_file(path.with_suffix('.lock'), timeout=5):
        number = int(path.read_text())
        time.sleep(0.01)
        path.write_text(str(number + 1))


class EnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_bad_download_is_not_published(self):
        package = {'url': 'https://example.invalid/package.tar.bz2', 'sha256': hashlib.sha256(b'valid').hexdigest()}
        with patch('urllib.request.urlopen', return_value=io.BytesIO(b'corrupt')):
            with self.assertRaisesRegex(RuntimeError, 'Checksum mismatch'):
                download(package, self.root)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_cached_download_is_verified_and_reused_without_network(self):
        payload = b'verified artifact'
        package = {'url': 'https://example.invalid/package.tar.bz2', 'sha256': hashlib.sha256(payload).hexdigest()}
        with patch('urllib.request.urlopen', return_value=io.BytesIO(payload)):
            target = download(package, self.root)
        with patch('urllib.request.urlopen', side_effect=AssertionError('cache should work offline')):
            self.assertEqual(download(package, self.root), target)
        target.write_bytes(b'corrupt cached data')
        with patch('urllib.request.urlopen', return_value=io.BytesIO(b'corrupt again')):
            with self.assertRaisesRegex(RuntimeError, 'Checksum mismatch'):
                download(package, self.root)
        self.assertFalse(target.exists())

    def test_concurrent_operations_are_serialized_across_processes(self):
        counter = self.root / 'counter'
        counter.write_text('0')
        with ProcessPoolExecutor(max_workers=4) as pool:
            list(pool.map(increment, [str(counter)] * 12))
        self.assertEqual(counter.read_text(), '12')

    def test_atomic_receipt_is_private_and_complete(self):
        target = self.root / 'state.json'
        atomic_json(target, {'ok': True})
        self.assertEqual(json.loads(target.read_text()), {'ok': True})
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_unrelated_source_env_is_preserved_before_install(self):
        source = self.root / '.env'
        source.write_text('DB_PASS=existing-private-value\n')
        args = argparse.Namespace(platform=str(self.root), state=str(self.root / 'state'),
            plugin_root=str(self.root), cache=str(self.root / 'cache'), db_port=15432,
            redis_port=16379, api_port=3000, web_port=4200)
        with patch('configuration.architecture'), patch('configuration.shutil.which', return_value='/bin/tool'), \
             patch('configuration.install') as install:
            with self.assertRaisesRegex(RuntimeError, 'already has .env'):
                prepare(args)
            install.assert_not_called()
        self.assertEqual(source.read_text(), 'DB_PASS=existing-private-value\n')

    def test_interrupted_configuration_resumes_without_rotating_secrets(self):
        state = self.root / 'state'
        state.mkdir()
        config = {'platform': str(self.root), 'ports': {'redis': 16379}}
        values = {'DB_PASS': 'original', 'REDIS_PASSWORD': 'same-on-retry'}
        (self.root / '.env').write_text('DB_PASS=original\nREDIS_PASSWORD=same-on-retry\n')
        finish_prepare(state, config, values)
        finish_prepare(state, config, values)
        self.assertEqual((state / 'postgres-password').read_text(), 'original\n')
        self.assertEqual((state / 'postgres-password').stat().st_mode & 0o777, 0o600)

    def test_partial_configuration_never_overwrites_a_changed_file(self):
        state = self.root / 'state'
        state.mkdir()
        (self.root / '.env').write_text('manually changed')
        with self.assertRaisesRegex(RuntimeError, 'differs'):
            finish_prepare(state, {'platform': str(self.root), 'ports': {'redis': 16379}},
                           {'DB_PASS': 'new', 'REDIS_PASSWORD': 'new'})
        self.assertEqual((self.root / '.env').read_text(), 'manually changed')

    def test_busy_port_is_not_adopted(self):
        with socket.socket() as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            with self.assertRaisesRegex(RuntimeError, 'unowned'):
                assert_port_free(listener.getsockname()[1])

    def test_closed_connection_does_not_block_service_restart(self):
        with socket.socket() as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
            listener.listen()
            with socket.create_connection(('127.0.0.1', port)) as client:
                accepted, _ = listener.accept()
                accepted.close()
                self.assertEqual(client.recv(1), b'')
        assert_port_free(port)

    def test_managed_mode_requires_an_external_supervisor(self):
        with patch('processes.subprocess.run', side_effect=AssertionError('must not spawn a detached supervisor')):
            with self.assertRaisesRegex(RuntimeError, 'supervise command under a persistent process owner'):
                start_supervisor({'state': str(self.root), 'supervisorMode': 'managed'})

    @unittest.skipUnless(sys.platform == 'linux' and shutil.which('supervisord'), 'Linux Supervisor integration')
    def test_foreground_supervisor_outlives_a_separate_control_client(self):
        (self.root / 'logs').mkdir()
        config = {'state': str(self.root), 'platform': str(self.root),
            'python': sys.executable, 'scripts': str(Path(__file__).parent),
            'supervisord': shutil.which('supervisord'), 'supervisorctl': shutil.which('supervisorctl')}
        process = launch_supervisor(config, foreground=True)
        try:
            client = subprocess.run([sys.executable, '-c',
                'import json,sys; from processes import control; print(control(json.loads(sys.argv[1]), "pid"))',
                json.dumps(config)], cwd=Path(__file__).parent, capture_output=True, text=True)
            self.assertEqual(client.returncode, 0, client.stderr)
            self.assertEqual(int(client.stdout.strip()), process.pid)
            self.assertIsNone(process.poll())
            self.assertTrue(owns_supervisor(config))
            stop(config)
            self.assertEqual(process.wait(timeout=30), 0)
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=30)

    def test_template_comments_are_not_exported_as_configuration_values(self):
        source = self.root / '.env'
        source.write_text('FILESTORAGE_PROVIDER=LOCAL # LOCAL, S3, OSS\n'
                          'QUOTED="https://example.test/#fragment" # note\n'
                          "export SINGLE='literal # value'\nEMPTY=\nAFTER=next\n")
        self.assertEqual(read_env(source), {'FILESTORAGE_PROVIDER': 'LOCAL',
            'QUOTED': 'https://example.test/#fragment', 'SINGLE': 'literal # value',
            'EMPTY': '', 'AFTER': 'next'})

    def test_logs_do_not_disclose_environment_secrets_or_tokens(self):
        (self.root / 'logs').mkdir()
        (self.root / '.env').write_text('DB_PASS=private-database-value\n')
        (self.root / 'logs/api.log').write_text('url: private-database-value\npassword: other-value\nready\n')
        result = redacted_tail({'state': str(self.root), 'platform': str(self.root)}, 'api')
        self.assertNotIn('private-database-value', result)
        self.assertNotIn('other-value', result)
        self.assertIn('ready', result)

    @unittest.skipUnless(sys.platform == 'linux', 'Linux /proc process boundary')
    def test_reused_or_unverified_pid_does_not_receive_control_commands(self):
        atomic_json(self.root / 'supervisor-identity.json', {'pid': os.getpid(), 'startTime': 'wrong'})
        config = {'state': str(self.root)}
        self.assertFalse(owns_supervisor(config))
        with patch('processes.subprocess.run', side_effect=AssertionError('must not control foreign process')):
            stop(config)

    @unittest.skipUnless(sys.platform == 'linux', 'Linux /proc listener boundary')
    def test_listener_must_belong_to_the_selected_process_tree(self):
        with socket.socket() as candidate:
            candidate.bind(('127.0.0.1', 0))
            port = candidate.getsockname()[1]
        process = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            deadline = time.monotonic() + 5
            while not owns_listener(process.pid, port) and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertTrue(owns_listener(process.pid, port))
            self.assertFalse(owns_listener(99999999, port))
            self.assertIsNotNone(identity(process.pid))
        finally:
            process.terminate()
            process.wait(timeout=5)


if __name__ == '__main__':
    unittest.main()
