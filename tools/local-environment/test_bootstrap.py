"""Exercise real subprocesses and persisted receipts without downloading a toolchain."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from source_bootstrap import assert_bootstrapped, bootstrap_source, dependency_receipt, TERMINAL_CHECK


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'checkout'
        self.root.mkdir()
        self.state = Path(self.temp.name) / 'state'
        (self.state / 'logs').mkdir(parents=True)
        self.toolchain = Path(self.temp.name) / 'node'
        (self.toolchain / 'bin').mkdir(parents=True)
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        self.write('.gitignore', 'node_modules/\n')
        self.write('package.json', '{"packageManager":"pnpm@10.24.0"}')
        self.write('pnpm-lock.yaml', 'locked')
        self.write('.npmrc', '//fixture/:_authToken=never-report-this-secret')
        self.write(TERMINAL_CHECK, 'fixture smoke test')
        program = '''#!/usr/bin/env python3
import json, sys
from pathlib import Path
root = Path.cwd()
args = sys.argv[1:]
if '-p' in args:
    print('{"version":"v22.0.0","modules":"127","arch":"x64","platform":"linux"}')
    sys.exit(0)
with (root / 'calls.jsonl').open('a') as output:
    output.write(json.dumps(args) + '\\n')
if args == ['pnpm', 'install', '--frozen-lockfile', '--reporter=append-only']:
    if (root / 'fail-install').exists(): sys.exit(7)
    for name in ['nx', 'typescript', 'node-pty']:
        path = root / 'node_modules' / name / 'package.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({'name': name, 'version': '1.0.0'}))
    (root / 'node_modules/.modules.yaml').write_text('installed')
    if (root / 'change-during-install').exists():
        (root / 'pnpm-lock.yaml').write_text('concurrent edit')
elif '--dir' in args:
    if (root / 'fail-terminal').exists(): sys.exit(8)
    (root / 'node_modules/node-pty/ready').write_text('built')
else:
    sys.exit(0 if (root / 'node_modules/node-pty/ready').exists() else 9)
'''
        for name in ('node', 'corepack'):
            path = self.toolchain / 'bin' / name
            path.write_text(program)
            path.chmod(0o700)
        self.config = {'state': str(self.state), 'platform': str(self.root),
            'runtime': str(Path(self.temp.name) / 'cache/runtimes/locked'),
            'node': str(self.toolchain / 'bin/node'), 'corepack': str(self.toolchain / 'bin/corepack')}
        self.node = patch('source_bootstrap.install_node', return_value=self.toolchain)
        self.env = patch('source_bootstrap.child_environment', return_value=os.environ.copy())
        self.home = patch('dependency_layout.Path.home', return_value=Path(self.temp.name) / 'home')
        self.home.start()
        self.node.start()
        self.env.start()

    def tearDown(self):
        self.home.stop()
        self.env.stop()
        self.node.stop()
        self.temp.cleanup()

    def write(self, path, text):
        file = self.root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text)

    def calls(self):
        return [json.loads(line) for line in (self.root / 'calls.jsonl').read_text().splitlines()]

    def install_count(self):
        return sum(command[:2] == ['pnpm', 'install'] for command in self.calls())

    def test_warm_bootstrap_only_probes_terminal_and_source_commit_does_not_reinstall(self):
        bootstrap_source(self.config)
        assert_bootstrapped(self.config)
        count = len(self.calls())
        self.write('apps/api/src/feature.ts', 'new application source')
        subprocess.run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                        'commit', '--quiet', '--allow-empty', '-m', 'source revision'], cwd=self.root, check=True)
        assert_bootstrapped(self.config)
        bootstrap_source(self.config)
        self.assertEqual(self.install_count(), 1)
        self.assertEqual(self.calls()[count:], [[TERMINAL_CHECK]])
        self.assertTrue(all('nx' not in command for command in self.calls()))
        self.assertIn('"status": "reused"', (self.state / 'logs/bootstrap.log').read_text())

    def test_changed_lock_manifest_patch_or_toolchain_requires_install(self):
        bootstrap_source(self.config)
        for path in ['pnpm-lock.yaml', 'packages/example/package.json', 'patches/example.patch']:
            self.write(path, 'changed dependency input')
            with self.assertRaisesRegex(RuntimeError, 'Dependency inputs'):
                assert_bootstrapped(self.config)
            bootstrap_source(self.config)
        (self.toolchain / 'bin/node').write_text((self.toolchain / 'bin/node').read_text() + '\n# new Node\n')
        with self.assertRaisesRegex(RuntimeError, 'Dependency inputs'):
            assert_bootstrapped(self.config)
        bootstrap_source(self.config)
        self.assertEqual(self.install_count(), 5)

    def test_missing_installed_layout_requires_repair(self):
        bootstrap_source(self.config)
        (self.root / 'node_modules/nx/package.json').unlink()
        with self.assertRaisesRegex(RuntimeError, 'Dependency inputs'):
            assert_bootstrapped(self.config)
        bootstrap_source(self.config)
        self.assertEqual(self.install_count(), 2)

    def test_missing_managed_cache_reinstalls_once_and_then_reuses(self):
        bootstrap_source(self.config)
        for install_count, remove_link in enumerate((False, True), start=2):
            with self.subTest(remove_link=remove_link):
                config = json.loads((self.state / 'environment.json').read_text())
                shutil.rmtree(config['dependencyLayout']['nodeModules'])
                if remove_link:
                    (self.root / 'node_modules').unlink()
                with self.assertRaisesRegex(RuntimeError, 'Dependency inputs'):
                    assert_bootstrapped(config)
                bootstrap_source(config)
                assert_bootstrapped(config)
                self.assertEqual(self.install_count(), install_count)
                self.assertTrue((self.root / 'node_modules').is_symlink())
                bootstrap_source(config)
                self.assertEqual(self.install_count(), install_count)

    def test_failed_install_is_not_reusable_and_successful_retry_publishes_receipt(self):
        bootstrap_source(self.config)
        self.write('pnpm-lock.yaml', 'updated lock')
        self.write('fail-install', 'fail')
        with self.assertRaisesRegex(RuntimeError, 'installation failed'):
            bootstrap_source(self.config)
        self.assertFalse(dependency_receipt(self.config).exists())
        with self.assertRaises(RuntimeError):
            assert_bootstrapped(self.config)
        (self.root / 'fail-install').unlink()
        bootstrap_source(self.config)
        assert_bootstrapped(self.config)

    def test_terminal_repair_reuses_completed_install_without_publishing_false_success(self):
        self.write('fail-terminal', 'fail')
        with self.assertRaisesRegex(RuntimeError, 'PTY repair failed'):
            bootstrap_source(self.config)
        self.assertTrue(dependency_receipt(self.config).exists())
        self.assertFalse((self.state / 'source-bootstrap.json').exists())
        (self.root / 'fail-terminal').unlink()
        bootstrap_source(self.config)
        assert_bootstrapped(self.config)
        self.assertEqual(self.install_count(), 1)

    def test_concurrent_input_change_cannot_publish_install_success(self):
        self.write('change-during-install', 'change')
        with self.assertRaisesRegex(RuntimeError, 'Install inputs changed'):
            bootstrap_source(self.config)
        self.assertFalse(dependency_receipt(self.config).exists())
        self.assertFalse((self.state / 'source-bootstrap.json').exists())

    def test_receipts_are_private_and_do_not_copy_credentials(self):
        bootstrap_source(self.config)
        for path in [dependency_receipt(self.config), self.state / 'source-bootstrap.json']:
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertNotIn('never-report-this-secret', path.read_text())


if __name__ == '__main__':
    unittest.main()
