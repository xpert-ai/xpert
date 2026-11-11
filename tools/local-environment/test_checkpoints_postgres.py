"""Opt-in cold-restore test against a disposable real PostgreSQL cluster.

Set XPERT_CHECKPOINT_PG_BIN to PostgreSQL's bin directory and run as non-root.
Everything, including the database and Git fixture, stays in a temporary folder.
API/Redis/Web probes are substitutes here; full Xpert acceptance is separate.
"""
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import checkpoints as cp
from processes import sql


@unittest.skipUnless(os.environ.get('XPERT_CHECKPOINT_PG_BIN'), 'Opt-in isolated PostgreSQL integration')
class PostgreSQLCheckpointTests(unittest.TestCase):
    def test_failed_install_state_can_be_restored_and_database_reopened(self):
        self.assertNotEqual(os.getuid(), 0, 'Run this test as an ordinary user')
        binaries = Path(os.environ['XPERT_CHECKPOINT_PG_BIN']).resolve()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            state, source = root / 'state', root / 'source'
            state.mkdir()
            source.mkdir()
            for name in ('plugins', 'redis', 'logs'):
                (state / name).mkdir()
            (state / 'plugins/original-plugin').write_text('existing version')
            (source / '.env').write_text('DB_PASS=unused-local-trust\n')
            for command in (['git', 'init', '-q'], ['git', '-c', 'user.name=Fixture',
                    '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'fixture']):
                subprocess.run(command, cwd=source, check=True, capture_output=True)
            ports = []
            for _ in cp.SERVICES:
                with socket.socket() as probe:
                    probe.bind(('127.0.0.1', 0))
                    ports.append(probe.getsockname()[1])
            config = {'state': str(state), 'platform': str(source),
                      'runtime': str(binaries.parent), 'node': sys.executable,
                      'ports': dict(zip(cp.SERVICES, ports))}
            subprocess.run([str(binaries / 'initdb'), '-D', str(state / 'postgres'),
                            '-U', 'xpert', '--auth=trust', '--no-locale'], check=True, capture_output=True)
            active = False
            def start():
                nonlocal active
                subprocess.run([str(binaries / 'pg_ctl'), '-D', str(state / 'postgres'),
                    '-l', str(state / 'logs/postgres.log'), '-o', f'-h 127.0.0.1 -p {ports[0]} -k {root}',
                    '-w', 'start'], check=True, capture_output=True, timeout=30)
                active = True
            def stop(_config=None, service='postgres'):
                nonlocal active
                if service == 'postgres' and active:
                    subprocess.run([str(binaries / 'pg_ctl'), '-D', str(state / 'postgres'),
                        '-m', 'fast', '-w', 'stop'], check=True, capture_output=True, timeout=30)
                    active = False
            def healthy(_config, service):
                return service != 'postgres' or sql(config, 'SELECT 1', 'postgres') == '1'
            try:
                start()
                sql(config, 'CREATE DATABASE xpert', 'postgres')
                sql(config, "CREATE TABLE retained (value text); INSERT INTO retained VALUES ('baseline')")
                system_id = sql(config, 'SELECT system_identifier FROM pg_control_system()', 'postgres')
                with patch('checkpoints.stop', side_effect=stop), patch('checkpoints.service_pid', return_value=0), \
                        patch('checkpoints.healthy', side_effect=healthy):
                    cp.create(config, 'before-install', 'isolated-integration')
                    self.assertFalse(active)
                    start()
                    sql(config, "UPDATE retained SET value = 'failed-install'; CREATE TABLE failed_install (id int)")
                    (state / 'plugins/broken-plugin').write_text('would fail API registration')
                    receipt = cp.restore(config, 'before-install', 'isolated-integration')
                    self.assertFalse(active)
                    self.assertTrue((Path(receipt['previousState']) / 'postgres/PG_VERSION').exists())
                    start()
                    self.assertEqual(sql(config, 'SELECT value FROM retained'), 'baseline')
                    self.assertEqual(sql(config, "SELECT count(*) FROM information_schema.tables WHERE table_name='failed_install'"), '0')
                    self.assertEqual(sql(config, 'SELECT system_identifier FROM pg_control_system()', 'postgres'), system_id)
                    self.assertTrue((state / 'plugins/original-plugin').exists())
                    self.assertFalse((state / 'plugins/broken-plugin').exists())
                    result = cp.verify(config, 'before-install', 'isolated-integration')
                    self.assertEqual(result['status'], 'environment_recovered')
                    self.assertFalse(result['acceptancePassed'])
            finally:
                stop()


if __name__ == '__main__':
    unittest.main()
