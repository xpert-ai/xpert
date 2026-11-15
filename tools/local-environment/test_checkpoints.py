import contextlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import checkpoints as cp
from processes import start_service


class CheckpointTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.state, self.platform = self.root / 'state', self.root / 'source'
        self.state.mkdir()
        self.platform.mkdir()
        self.config = {'state': str(self.state), 'platform': str(self.platform),
                       'runtime': str(self.root / 'runtime'),
                       'ports': dict(zip(cp.SERVICES, range(24000, 24004)))}
        for folder in ('postgres', 'redis', 'plugins', 'data'):
            (self.state / folder).mkdir()
            (self.state / folder / 'existing').write_text('original ' + folder)
        (self.platform / '.env').write_text('private-secret')
        (self.platform / 'feature.ts').write_text('source remains writable')
        (self.state / 'admin-credentials.json').write_text('private-admin')
        (self.state / 'logs').mkdir()
        (self.state / 'logs/failure.log').write_text('keep failure evidence')
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        for name, value in [('healthy', True), ('service_pid', 0), ('assert_port_free', None),
                            ('stop', None), ('database_identity', '1234')]:
            self.stack.enter_context(patch('checkpoints.' + name, return_value=value))
        self.stack.enter_context(patch('checkpoints.subprocess.check_output', return_value='revision\n'))

    def create(self):
        return cp.create(self.config, 'pre-install', 'project-one')

    def mutate(self):
        (self.state / 'postgres/existing').write_text('changed database')
        (self.state / 'plugins/failed').write_text('bad plugin')
        (self.state / 'public').mkdir()
        (self.state / 'public/new').write_text('post-checkpoint asset')

    def test_restore_preserves_other_plugins_code_credentials_and_failure_evidence(self):
        created = self.create()
        self.mutate()
        (self.platform / 'feature.ts').write_text('agent fixed the feature')
        result = cp.restore(self.config, 'pre-install', 'project-one')
        self.assertEqual(created['status'], 'checkpoint_created')
        self.assertEqual(result['status'], 'state_restored')
        self.assertFalse(result['acceptancePassed'])
        self.assertEqual((self.state / 'postgres/existing').read_text(), 'original postgres')
        self.assertEqual((self.state / 'plugins/existing').read_text(), 'original plugins')
        self.assertFalse((self.state / 'plugins/failed').exists())
        self.assertFalse((self.state / 'public').exists())
        self.assertEqual((self.platform / 'feature.ts').read_text(), 'agent fixed the feature')
        self.assertEqual((self.state / 'logs/failure.log').read_text(), 'keep failure evidence')
        self.assertEqual((self.state / 'admin-credentials.json').read_text(), 'private-admin')
        saved = Path(result['previousState'])
        self.assertEqual((saved / 'postgres/existing').read_text(), 'changed database')
        self.assertEqual((saved / 'plugins/failed').read_text(), 'bad plugin')
        self.assertEqual((saved / 'public/new').read_text(), 'post-checkpoint asset')
        self.assertEqual(cp.restore(self.config, 'pre-install', 'project-one'), result)
        self.assertEqual((self.state / 'checkpoints').stat().st_mode & 0o777, 0o700)

    def test_restore_resumes_after_each_rename_before_journal_update(self):
        self.create()
        # Four original roots (two renames each), plus a newly-created public
        # directory (one rename). Interrupt immediately after each real rename.
        for failure_at in range(1, 10):
            with self.subTest(rename=failure_at):
                self.mutate()
                original = os.rename
                count = 0
                def interrupted(source, target):
                    nonlocal count
                    original(source, target)
                    count += 1
                    if count == failure_at:
                        raise OSError('simulated process interruption')
                with patch('checkpoints.os.rename', side_effect=interrupted):
                    with self.assertRaises(OSError):
                        cp.restore(self.config, 'pre-install', 'project-one')
                self.assertTrue((self.state / cp.PENDING).exists())
                with self.assertRaisesRegex(RuntimeError, 'incomplete'):
                    start_service(self.config, 'api', 1)
                result = cp.restore(self.config, 'pre-install', 'project-one')
                self.assertEqual(result['status'], 'state_restored')
                self.assertFalse((self.state / cp.PENDING).exists())
                self.assertEqual((self.state / 'postgres/existing').read_text(), 'original postgres')

    def test_pending_restore_rejects_newer_write_to_restored_root(self):
        self.create()
        self.mutate()
        actual = cp.restore_entry
        def interrupted(state, operation, name, entry, expected):
            if name == 'redis':
                raise OSError('interruption')
            actual(state, operation, name, entry, expected)
        with patch('checkpoints.restore_entry', side_effect=interrupted):
            with self.assertRaises(OSError):
                cp.restore(self.config, 'pre-install', 'project-one')
        (self.state / 'postgres/existing').write_text('newer external write')
        with self.assertRaisesRegex(RuntimeError, 'Previously restored state changed'):
            cp.restore(self.config, 'pre-install', 'project-one')
        self.assertEqual((self.state / 'postgres/existing').read_text(), 'newer external write')

    def test_project_config_and_database_mismatch_do_not_restore(self):
        self.create()
        self.mutate()
        with self.assertRaisesRegex(RuntimeError, 'different project'):
            cp.restore(self.config, 'pre-install', 'another-project')
        with patch('checkpoints.database_identity', return_value='9999'):
            with self.assertRaisesRegex(RuntimeError, 'Database identity changed'):
                cp.restore(self.config, 'pre-install', 'project-one')
        (self.state / 'admin-credentials.json').write_text('rotated')
        with self.assertRaisesRegex(RuntimeError, 'configuration'):
            cp.restore(self.config, 'pre-install', 'project-one')
        self.assertEqual((self.state / 'postgres/existing').read_text(), 'changed database')

    def test_corrupt_payload_is_rejected_before_stopping_services(self):
        self.create()
        (self.state / 'checkpoints/pre-install/payload/plugins/existing').write_text('corrupt')
        with patch('checkpoints.stop') as stop:
            with self.assertRaisesRegex(RuntimeError, 'payload'):
                cp.restore(self.config, 'pre-install', 'project-one')
            stop.assert_not_called()

    def test_no_checkpoint_is_published_when_copy_interrupted(self):
        with patch('checkpoints.shutil.copytree', side_effect=OSError('disk failure')):
            with self.assertRaises(OSError):
                self.create()
        self.assertFalse((self.state / 'checkpoints/pre-install').exists())
        self.assertEqual((self.state / 'plugins/existing').read_text(), 'original plugins')

    def test_healthy_baseline_and_free_owned_ports_are_required(self):
        with patch('checkpoints.healthy', return_value=False), patch('checkpoints.stop') as stop:
            with self.assertRaisesRegex(RuntimeError, 'healthy instance'):
                self.create()
            stop.assert_not_called()
        with patch('checkpoints.assert_port_free', side_effect=RuntimeError('unowned service')):
            with self.assertRaisesRegex(RuntimeError, 'unowned service'):
                self.create()
        self.assertFalse((self.state / 'checkpoints/pre-install').exists())

    def test_external_data_links_rejected_host_peers_preserved_without_following(self):
        outside = self.root / 'other-user-data'
        outside.mkdir()
        (self.state / 'data/external').symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'External state links'):
            self.create()
        (self.state / 'data/external').unlink()
        (self.state / 'plugins/sdk').symlink_to(self.platform, target_is_directory=True)
        self.create()
        copy = self.state / 'checkpoints/pre-install/payload/plugins/sdk'
        self.assertTrue(copy.is_symlink())
        self.assertEqual(os.readlink(copy), str(self.platform))

    def test_root_symlinks_and_special_files_refused(self):
        shutil.rmtree(self.state / 'data')
        (self.state / 'data').symlink_to(self.platform, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'roots must not be symlinks'):
            self.create()
        (self.state / 'data').unlink()
        (self.state / 'data').mkdir()
        os.mkfifo(self.state / 'data/pipe')
        with self.assertRaisesRegex(RuntimeError, 'special file'):
            self.create()

    def test_verify_reports_readiness_and_continuity_without_business_pass(self):
        self.create()
        self.mutate()
        cp.restore(self.config, 'pre-install', 'project-one')
        with patch('checkpoints.healthy', return_value=False):
            self.assertEqual(cp.verify(self.config, 'pre-install', 'project-one')['status'], 'not_ready')
        with patch('checkpoints.sql', return_value='1234'):
            result = cp.verify(self.config, 'pre-install', 'project-one')
        self.assertEqual(result['status'], 'environment_recovered')
        self.assertFalse(result['acceptancePassed'])
        with patch('checkpoints.sql', return_value='9999'):
            self.assertEqual(cp.verify(self.config, 'pre-install', 'project-one')['status'], 'identity_mismatch')

    def test_names_cannot_escape_checkpoint_store(self):
        for name in ('../outside', '/outside', '.', 'foo/bar'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                cp.create(self.config, name, 'project-one')

    def test_unmanaged_postgres_on_another_port_is_not_overwritten(self):
        self.create()
        (self.state / 'postgres/PG_VERSION').write_text('15')
        with patch('checkpoints.subprocess.run', return_value=SimpleNamespace(returncode=0)):
            with self.assertRaisesRegex(RuntimeError, 'still in use'):
                cp.restore(self.config, 'pre-install', 'project-one')
        self.assertTrue((self.state / 'postgres/PG_VERSION').exists())

    def test_cli_refuses_mutations_while_restore_is_pending(self):
        import cli
        (self.state / cp.PENDING).write_text('{}')
        for action in ('start', 'build', 'initialize'):
            with self.subTest(action=action):
                args = SimpleNamespace(action=action, platform=str(self.platform), state=str(self.state), project_root=None)
                with patch('cli.arguments', return_value=args), patch('cli.architecture'), \
                        patch('cli.load', return_value=self.config), patch('cli.infrastructure') as start:
                    with self.assertRaisesRegex(RuntimeError, 'Restore is incomplete'):
                        cli.main()
                    start.assert_not_called()

    def test_database_identity_requires_actual_clean_shutdown(self):
        # Test the adapter separately from the filesystem recovery fixtures.
        self.stack.close()
        good = 'Database system identifier: 1234\nDatabase cluster state: shut down\n'
        with patch('checkpoints.subprocess.check_output', return_value=good) as command:
            self.assertEqual(cp.database_identity(self.config), '1234')
            self.assertEqual(command.call_args.kwargs['env']['LC_ALL'], 'C')
        with patch('checkpoints.subprocess.check_output', return_value=good.replace('shut down', 'in production')):
            with self.assertRaisesRegex(RuntimeError, 'clean shutdown'):
                cp.database_identity(self.config)
            self.assertEqual(cp.database_identity(self.config, require_clean=False), '1234')


if __name__ == '__main__':
    unittest.main()
