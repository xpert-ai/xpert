import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from builds import OUTPUTS, check_build, ensure_build, output_fingerprint, receipt_path, source_fingerprint
from runtime import atomic_json


class BuildReuseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'checkout'
        self.root.mkdir()
        self.state = Path(self.temp.name) / 'state'
        self.state.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        self.write('apps/cloud/src/main.ts', 'first source')
        self.write('.gitignore', 'dist/\nnode_modules/\n.env\n')
        self.write('.env', 'API_BASE_URL=http://localhost:3001\nDB_PASS=fixture-private\n')
        self.write('pnpm-lock.yaml', 'lock')
        self.config = {'platform': str(self.root), 'state': str(self.state),
                       'runtime': str(self.root / 'runtime'), 'node': shutil.which('node'),
                       'corepack': shutil.which('corepack')}
        self.assertTrue(self.config['node'], 'Run with the selected Node in PATH')

    def tearDown(self):
        self.temp.cleanup()

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return path

    def publish(self):
        self.write('dist/apps/cloud/browser/index.html', '<html>verified output</html>')
        self.write('dist/apps/cloud/browser/chunk.js', 'compiled')
        atomic_json(receipt_path(self.config, 'web'), {'version': 1, 'service': 'web',
            'platform': str(self.root), 'inputs': source_fingerprint(self.config, 'web'),
            'outputs': output_fingerprint(self.config, 'web')})

    def test_unchanged_build_reuses_without_running_compiler(self):
        self.publish()
        # check_output also uses subprocess.run, so preserve fingerprint probes.
        real_run = subprocess.run
        def run(command, **kwargs):
            self.assertNotIn('pnpm', command)
            return real_run(command, **kwargs)
        with patch('builds.subprocess.run', side_effect=run):
            self.assertEqual(ensure_build(self.config, 'web'), 'reused')

    def test_dirty_new_deleted_source_lock_settings_and_generated_assets_invalidate(self):
        for name, content in [('apps/cloud/src/main.ts', 'changed'),
                              ('packages/new-lib/new.ts', 'new source'),
                              ('pnpm-lock.yaml', 'new lock'),
                              ('patches/runtime.patch', 'changed dependency patch'),
                              ('.env', 'API_BASE_URL=http://localhost:9999'),
                              ('apps/cloud/src/assets/generated.json', '{}'),
                              ('node_modules/.modules.yaml', 'different installed layout')]:
            with self.subTest(name=name):
                self.publish()
                self.write(name, content)
                self.assertEqual(check_build(self.config, 'web'), (False, 'inputs_changed'))
        self.publish()
        (self.root / 'apps/cloud/src/main.ts').unlink()
        self.assertEqual(check_build(self.config, 'web'), (False, 'inputs_changed'))

    def test_changed_output_or_missing_entry_never_reuses(self):
        self.publish()
        self.write('dist/apps/cloud/browser/chunk.js', 'tampered')
        self.assertEqual(check_build(self.config, 'web'), (False, 'outputs_changed'))
        self.publish()
        (self.root / 'dist/apps/cloud/browser/index.html').unlink()
        self.assertEqual(check_build(self.config, 'web'), (False, 'outputs_changed'))

    def test_failed_compilation_does_not_leave_a_success_receipt(self):
        self.publish()
        self.write('apps/cloud/src/main.ts', 'invalidate')
        real_run = subprocess.run
        def run(command, **kwargs):
            if 'pnpm' in command:
                raise subprocess.CalledProcessError(7, command)
            return real_run(command, **kwargs)
        with patch('builds.subprocess.run', side_effect=run):
            with self.assertRaises(subprocess.CalledProcessError):
                ensure_build(self.config, 'web')
        self.assertFalse(receipt_path(self.config, 'web').exists())

    def test_successful_build_publishes_private_receipt_without_secrets(self):
        real_run = subprocess.run
        def run(command, **kwargs):
            if 'pnpm' in command:
                self.write('dist/apps/cloud/browser/index.html', 'build output')
                return subprocess.CompletedProcess(command, 0)
            return real_run(command, **kwargs)
        with patch('builds.subprocess.run', side_effect=run):
            self.assertEqual(ensure_build(self.config, 'web'), 'built')
        path = receipt_path(self.config, 'web')
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertNotIn('fixture-private', path.read_text())
        self.assertEqual(check_build(self.config, 'web'), (True, 'verified'))

    def test_source_change_during_build_cannot_publish_a_receipt(self):
        real_run = subprocess.run
        def run(command, **kwargs):
            if 'pnpm' in command:
                self.write('dist/apps/cloud/browser/index.html', 'output')
                self.write('apps/cloud/src/main.ts', 'concurrent edit')
                return subprocess.CompletedProcess(command, 0)
            return real_run(command, **kwargs)
        with patch('builds.subprocess.run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'inputs changed'):
                ensure_build(self.config, 'web')
        self.assertFalse(receipt_path(self.config, 'web').exists())

    def test_api_generated_assets_are_verified_outputs_not_concurrent_source_edits(self):
        self.write('apps/api/project.json', json.dumps({'targets': {'build': {'options': {
            'assets': [{'input': 'packages/server-ai/src/review/remote-components'}]
        }}}}))
        self.write('packages/server-ai/project.json', json.dumps({'targets': {
            'build-remote-components': {'outputs': ['{projectRoot}/src/**/remote-components/**/app.js']}
        }}))
        generated = 'packages/server-ai/src/review/remote-components/view/app.js'
        real_run = subprocess.run
        def run(command, **kwargs):
            if '--build-only' in command:
                for directory in OUTPUTS['api']:
                    (self.root / directory).mkdir(parents=True, exist_ok=True)
                self.write('dist/apps/api/main.js', 'compiled API')
                self.write(generated, 'generated during API build')
                return subprocess.CompletedProcess(command, 0)
            return real_run(command, **kwargs)
        with patch('builds.subprocess.run', side_effect=run):
            self.assertEqual(ensure_build(self.config, 'api'), 'built')
        self.assertEqual(check_build(self.config, 'api'), (True, 'verified'))
        self.write(generated, 'changed after build')
        self.assertEqual(check_build(self.config, 'api'), (False, 'outputs_changed'))

    def test_toolchain_or_compiler_environment_change_invalidates(self):
        self.publish()
        with patch.dict(os.environ, {'QEMU_GUEST_BASE': '0x12340000'}):
            self.assertEqual(check_build(self.config, 'web'), (False, 'inputs_changed'))
        self.publish()
        self.config['corepack'] = str(self.write('corepack-fixture', 'different corepack'))
        self.assertEqual(check_build(self.config, 'web'), (False, 'inputs_changed'))


if __name__ == '__main__':
    unittest.main()
