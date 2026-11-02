"""Filesystem tests, including real root Runner/non-root API processes on Linux."""
from concurrent.futures import ThreadPoolExecutor
import errno
import os
import pathlib
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from workspace_identity import WorkspaceIdentity


class WorkspaceIdentityTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        self.identity = WorkspaceIdentity(os.geteuid(), os.getegid())

    def tearDown(self):
        self.temporary.cleanup()

    def test_creation_and_repeated_preparation_preserve_content_and_inode(self):
        self.identity.prepare_app_data(self.root)
        app = self.root / '.apps'
        (app / 'record').write_bytes(b'preserve')
        inode = app.stat().st_ino
        self.identity.prepare_app_data(self.root)
        self.assertEqual(app.stat().st_ino, inode)
        self.assertEqual((app / 'record').read_bytes(), b'preserve')
        self.assertTrue(self.identity.matches(app.stat()))

    def test_existing_private_directory_permissions_are_preserved(self):
        app = self.root / '.apps'
        app.mkdir(mode=0o700)
        self.identity.prepare_app_data(self.root)
        self.assertEqual(stat.S_IMODE(app.stat().st_mode), 0o700)

    def test_managed_symlink_and_regular_file_are_rejected(self):
        outside = self.root / 'outside'
        outside.mkdir()
        before = outside.stat()
        app = self.root / '.apps'
        app.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(OSError):
            self.identity.prepare_app_data(self.root)
        self.assertEqual(outside.stat(), before)
        app.unlink()
        app.write_text('keep')
        with self.assertRaises(OSError):
            self.identity.prepare_app_data(self.root)
        self.assertEqual(app.read_text(), 'keep')

    def test_invalid_identity_and_directory_components_are_rejected(self):
        for uid in (-1, True, '1000', 2**32 - 1):
            with self.subTest(uid=uid), self.assertRaises(ValueError):
                WorkspaceIdentity(uid, 1000)
        fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            for component in ('', '.', '..', 'a/b', 'a\\b', 'a\0b'):
                with self.subTest(component=component), self.assertRaises(OSError):
                    self.identity.open_directory(fd, component)
        finally:
            os.close(fd)

    def test_missing_owner_write_permission_is_reported_without_chmod(self):
        app = self.root / '.apps'
        app.mkdir(mode=0o500)
        with self.assertRaisesRegex(PermissionError, 'workspace UID/GID'):
            self.identity.prepare_app_data(self.root)
        self.assertEqual(stat.S_IMODE(app.stat().st_mode), 0o500)


@unittest.skipUnless(sys.platform == 'linux' and os.geteuid() == 0,
                     'Requires an isolated Linux container running as root')
class RootRunnerIdentityTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        self.root.chmod(0o711)
        self.workspace = self.root / 'workspace'
        self.workspace.mkdir()
        self.identity = WorkspaceIdentity(1000, 1000)
        os.chown(self.workspace, self.identity.uid, self.identity.gid)

    def tearDown(self):
        self.temporary.cleanup()

    def api(self, script, *, identity=None):
        owner = identity or self.identity
        return subprocess.run([sys.executable, '-I', '-c', script, str(self.workspace)],
                              user=owner.uid, group=owner.gid, extra_groups=[], umask=0,
                              capture_output=True, text=True, check=True, timeout=15)

    def save_as_api(self):
        self.api("""
import os, pathlib, sys
root = pathlib.Path(sys.argv[1])
app = root / '.apps'
app.mkdir(mode=0o755, exist_ok=True)
fd = os.open(app, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    content = pathlib.Path('/proc/self/fd') / str(fd) / 'artifact_content'
    content.mkdir(exist_ok=True)
    (content / 'draft').write_text('saved')
finally:
    os.close(fd)
""")

    def test_runner_first_and_api_first_both_support_descriptor_anchored_saves(self):
        for runner_first in (True, False):
            with self.subTest(runner_first=runner_first):
                if runner_first:
                    self.identity.prepare_app_data(self.workspace)
                self.save_as_api()
                self.identity.prepare_app_data(self.workspace)
                self.save_as_api()
                self.assertTrue(self.identity.matches((self.workspace / '.apps').stat()))
                self.assertEqual((self.workspace / '.apps/artifact_content/draft').read_text(), 'saved')
                import shutil
                shutil.rmtree(self.workspace / '.apps')

    def test_concurrent_runner_processes_and_api_initialization(self):
        runner_script = "from workspace_identity import WorkspaceIdentity; import pathlib,sys; WorkspaceIdentity(1000,1000).prepare_app_data(pathlib.Path(sys.argv[1]))"
        def prepare():
            subprocess.run([sys.executable, '-c', runner_script, str(self.workspace)],
                           cwd=pathlib.Path(__file__).parent, check=True, capture_output=True, timeout=15)
        with ThreadPoolExecutor(max_workers=8) as executor:
            operations = [executor.submit(prepare) for _ in range(4)]
            operations += [executor.submit(self.save_as_api) for _ in range(4)]
            for operation in operations:
                operation.result()
        self.assertTrue(self.identity.matches((self.workspace / '.apps').stat()))
        self.assertEqual((self.workspace / '.apps/artifact_content/draft').read_text(), 'saved')

    def test_api_can_write_before_runner_returns_from_directory_creation(self):
        real_run = subprocess.run
        def create_then_write(*args, **kwargs):
            result = real_run(*args, **kwargs)
            with mock.patch('workspace_identity.subprocess.run', real_run):
                self.save_as_api()
            return result
        with mock.patch('workspace_identity.subprocess.run', side_effect=create_then_write):
            self.identity.prepare_app_data(self.workspace)
        self.assertTrue(self.identity.matches((self.workspace / '.apps').stat()))

    def test_legacy_root_mountpoint_is_repaired_without_touching_children(self):
        app = self.workspace / '.apps'
        app.mkdir(mode=0o755)
        (app / 'retained').write_bytes(b'existing version')
        child = (app / 'retained').stat()
        inode = app.stat().st_ino
        self.identity.prepare_app_data(self.workspace)
        self.save_as_api()
        self.assertEqual(app.stat().st_ino, inode)
        self.assertEqual((app / 'retained').stat(), child)
        self.assertEqual((app / 'retained').read_bytes(), b'existing version')

    def test_unrelated_owner_and_mismatched_volume_are_not_adopted(self):
        app = self.workspace / '.apps'
        app.mkdir()
        for owner, mode, parent_owner in ((2000, 0o755, 1000), (0, 0o700, 1000), (0, 0o755, 2000)):
            os.chown(app, owner, owner)
            app.chmod(mode)
            os.chown(self.workspace, parent_owner, parent_owner)
            before = app.stat()
            with self.subTest(owner=owner, mode=mode, parent_owner=parent_owner):
                with self.assertRaises(PermissionError):
                    self.identity.prepare_app_data(self.workspace)
                self.assertEqual(app.stat(), before)

    def test_non_default_identity_is_used_for_nested_upload_directories(self):
        self.identity = WorkspaceIdentity(21001, 21002)
        os.chown(self.workspace, self.identity.uid, self.identity.gid)
        self.identity.prepare_app_data(self.workspace)
        self.save_as_api()
        import runner
        runtime = runner.Runtime('a' * 32, self.workspace, '/workspace')
        with mock.patch.object(runner, 'JAIL_UID', self.identity.uid), mock.patch.object(runner, 'JAIL_GID', self.identity.gid):
            import base64
            result = runner.upload_file(runtime, '/workspace/nested/deeper/file', base64.b64encode(b'first').decode())
        self.assertIsNone(result['error'])
        for relative in ('.apps', 'nested', 'nested/deeper', 'nested/deeper/file'):
            self.assertTrue(self.identity.matches((self.workspace / relative).stat()), relative)
        self.api("import pathlib,sys; (pathlib.Path(sys.argv[1])/'nested/deeper/file').write_text('edited')")

    def test_unwritable_volume_fails_without_creating_a_root_owned_directory(self):
        self.workspace.chmod(0o555)
        with self.assertRaises(OSError) as caught:
            self.identity.prepare_app_data(self.workspace)
        self.assertEqual(caught.exception.errno, errno.EACCES)
        self.assertFalse((self.workspace / '.apps').exists())


if __name__ == '__main__':
    unittest.main()
