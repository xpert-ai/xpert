import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from dependency_layout import dependency_environment, prepare_dependency_layout


class DependencyLayoutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.home = patch('dependency_layout.Path.home', return_value=self.root / 'home')
        self.home.start()

    def tearDown(self):
        self.home.stop()
        self.temp.cleanup()

    def config(self, name):
        source, state = self.root / name, self.root / (name + '-state')
        source.mkdir()
        state.mkdir()
        return {'platform': str(source), 'state': str(state),
                'runtime': str(self.root / 'home/cache/runtimes/locked')}

    def test_projects_share_store_but_not_mutable_modules(self):
        first, second = self.config('one'), self.config('two')
        a, b = prepare_dependency_layout(first), prepare_dependency_layout(second)
        self.assertEqual(a['storeDir'], b['storeDir'])
        self.assertNotEqual(a['nodeModules'], b['nodeModules'])
        self.assertEqual((Path(first['platform']) / 'node_modules').resolve(), Path(a['nodeModules']).resolve())
        saved = json.loads((Path(first['state']) / 'environment.json').read_text())
        self.assertEqual(dependency_environment(saved, {})['npm_config_store_dir'], a['storeDir'])

    def test_preserves_existing_layout_and_does_not_force_store_migration(self):
        config = self.config('existing')
        modules = Path(config['platform']) / 'node_modules'
        modules.mkdir()
        (modules / 'working').write_text('preserve')
        self.assertIsNone(prepare_dependency_layout(config))
        self.assertFalse(modules.is_symlink())
        self.assertEqual((modules / 'working').read_text(), 'preserve')
        self.assertEqual(dependency_environment(config, {}), {})

    def test_retains_external_symlinks_and_does_not_adopt_them_as_managed(self):
        config = self.config('linked')
        target = self.root / 'old-home-volume'
        target.mkdir()
        (Path(config['platform']) / 'node_modules').symlink_to(target)
        self.assertIsNone(prepare_dependency_layout(config))
        self.assertNotIn('dependencyLayout', config)

    def test_recovers_link_publication_but_rejects_replaced_layout(self):
        config = self.config('recover')
        layout = prepare_dependency_layout(config)
        modules = Path(config['platform']) / 'node_modules'
        modules.unlink()
        self.assertEqual(prepare_dependency_layout(config), layout)
        modules.unlink()
        modules.mkdir()
        with self.assertRaisesRegex(RuntimeError, 'layout changed'):
            prepare_dependency_layout(config)

    def test_recovers_missing_cache_with_or_without_checkout_link(self):
        for keep_link in (True, False):
            with self.subTest(keep_link=keep_link):
                config = self.config(f'cache-missing-{keep_link}')
                layout = prepare_dependency_layout(config)
                modules = Path(config['platform']) / 'node_modules'
                target = Path(layout['nodeModules'])
                manifest = Path(config['state']) / 'environment.json'
                saved = manifest.read_bytes()
                target.rmdir()
                target.parent.rmdir()
                if not keep_link:
                    modules.unlink()
                self.assertEqual(prepare_dependency_layout(config), layout)
                self.assertTrue(target.is_dir())
                self.assertEqual(target.stat().st_mode & 0o777, 0o700)
                self.assertTrue(modules.is_symlink())
                self.assertEqual(modules.resolve(), target.resolve())
                self.assertEqual(manifest.read_bytes(), saved)
                (target / 'reinstalled').write_text('preserve')
                prepare_dependency_layout(config)
                self.assertEqual((modules / 'reinstalled').read_text(), 'preserve')

    def test_rejects_foreign_links_before_recreating_missing_cache(self):
        for foreign_exists in (True, False):
            with self.subTest(foreign_exists=foreign_exists):
                config = self.config(f'foreign-{foreign_exists}')
                layout = prepare_dependency_layout(config)
                modules = Path(config['platform']) / 'node_modules'
                target = Path(layout['nodeModules'])
                foreign = self.root / f'foreign-cache-{foreign_exists}'
                if foreign_exists:
                    foreign.mkdir()
                    (foreign / 'untouched').write_text('preserve')
                target.rmdir()
                modules.unlink()
                modules.symlink_to(foreign)
                with self.assertRaisesRegex(RuntimeError, 'layout changed'):
                    prepare_dependency_layout(config)
                self.assertFalse(target.exists())
                self.assertEqual(modules.resolve(), foreign.resolve())
                self.assertEqual(foreign.exists(), foreign_exists)
                if foreign_exists:
                    self.assertEqual((foreign / 'untouched').read_text(), 'preserve')

    def test_rejects_replaced_target_before_republishing_link(self):
        for replacement in ('file', 'symlink', 'dangling-symlink'):
            with self.subTest(replacement=replacement):
                config = self.config(f'target-{replacement}')
                layout = prepare_dependency_layout(config)
                modules = Path(config['platform']) / 'node_modules'
                target = Path(layout['nodeModules'])
                foreign = self.root / f'foreign-target-{replacement}'
                modules.unlink()
                target.rmdir()
                if replacement == 'file':
                    target.write_text('preserve')
                else:
                    if replacement == 'symlink':
                        foreign.mkdir()
                        (foreign / 'untouched').write_text('preserve')
                    target.symlink_to(foreign)
                with self.assertRaisesRegex(RuntimeError, 'target changed'):
                    prepare_dependency_layout(config)
                self.assertFalse(modules.exists())
                self.assertFalse(modules.is_symlink())
                if replacement == 'file':
                    self.assertEqual(target.read_text(), 'preserve')
                elif replacement == 'symlink':
                    self.assertEqual((foreign / 'untouched').read_text(), 'preserve')
                else:
                    self.assertFalse(foreign.exists())


if __name__ == '__main__':
    unittest.main()
