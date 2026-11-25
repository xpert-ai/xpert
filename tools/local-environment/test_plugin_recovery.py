import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from plugin_recovery import inspect_snapshots, retry_startup


class PluginRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.folder = self.root / 'plugins/.runtime-plugin-state'
        self.folder.mkdir(parents=True)
        self.name = 'a' * 64 + '.json'
        self.file = self.folder / self.name
        self.value = {'attempted': 'failed-candidate', 'blocked': 'failed-candidate', 'recovering': True,
                      'good': [{'configs': {'secret': 'private-test-secret'}}],
                      'failure': {'pluginName': 'fixture', 'stage': 'import', 'code': 'PLUGIN_STARTUP_FAILED'},
                      'goodRuntime': {'plugins': [{'version': 'retained'}]}}
        self.file.write_text(json.dumps(self.value))
        self.raw = self.file.read_bytes()
        self.sha = hashlib.sha256(self.raw).hexdigest()
        self.config = {'state': str(self.root), 'projectRoot': str(self.root / 'project'),
                       'ports': {'api': 12345}, 'identity': {'XPERT_PLUGIN_PATH': str(self.root / 'plugins')}}
        self.stop = self.patch('stop')
        self.patch('owns_supervisor', return_value=True)
        self.pid = self.patch('service_pid', return_value=0)
        self.port = self.patch('assert_port_free')

    def patch(self, name, **kwargs):
        obj = patch('plugin_recovery.' + name, **kwargs)
        result = obj.start()
        self.addCleanup(obj.stop)
        return result

    def retry(self):
        return retry_startup(self.config, self.name, self.sha)

    def test_explicit_retry_keeps_private_baseline_failure_and_exact_backup(self):
        observed = inspect_snapshots(self.config)
        self.assertNotIn('private-test-secret', json.dumps(observed))
        receipt = self.retry()
        self.stop.assert_called_once_with(self.config, 'api')
        self.assertFalse(receipt['serviceStarted'])
        self.assertFalse(receipt['acceptancePassed'])
        self.assertNotIn('private-test-secret', json.dumps(receipt))
        backup = Path(receipt['privateBackup'])
        self.assertEqual(backup.read_bytes(), self.raw)
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        after = json.loads(self.file.read_text())
        self.assertFalse(after['recovering'])
        self.assertNotIn('attempted', after)
        self.assertNotIn('blocked', after)
        for key in ('good', 'goodRuntime', 'failure'):
            self.assertEqual(after[key], self.value[key])
        with self.assertRaisesRegex(RuntimeError, 'changed'):
            self.retry()

    def test_stale_digest_does_not_stop_or_change_api(self):
        self.file.write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'changed'):
            self.retry()
        self.stop.assert_not_called()

    def test_snapshot_change_during_stop_is_not_overwritten(self):
        self.stop.side_effect = lambda *_: self.file.write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'changed while stopping'):
            self.retry()
        self.assertEqual(self.file.read_text(), '{}')
        self.assertEqual(list(self.folder.glob('*.before-retry-*')), [])

    def test_live_api_or_unknown_port_refuses_mutation(self):
        self.pid.return_value = 99
        with self.assertRaisesRegex(RuntimeError, 'still running'):
            self.retry()
        self.pid.return_value = 0
        self.port.side_effect = RuntimeError('Unknown listener')
        with self.assertRaisesRegex(RuntimeError, 'Unknown listener'):
            self.retry()
        self.assertEqual(self.file.read_bytes(), self.raw)

    def test_requires_exact_storage_and_project_and_supervisor(self):
        for change in ({'projectRoot': None}, {'identity': {'XPERT_PLUGIN_PATH': '/another-instance'}}):
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                retry_startup({**self.config, **change}, self.name, self.sha)
        with patch('plugin_recovery.owns_supervisor', return_value=False), self.assertRaisesRegex(RuntimeError, 'Supervisor'):
            self.retry()
        self.stop.assert_not_called()

    def test_symlink_or_special_snapshot_is_never_read(self):
        self.file.unlink()
        self.file.symlink_to(self.root / 'private-outside')
        with self.assertRaises(OSError):
            self.retry()
        self.file.unlink()
        os.mkfifo(self.file)
        with self.assertRaisesRegex(RuntimeError, 'regular file'):
            self.retry()
        self.stop.assert_not_called()


if __name__ == '__main__':
    unittest.main()
