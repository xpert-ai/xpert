import base64
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from bounded_workspace import Entry, StorageBudget, StorageBudgetError, manifest, parse_budget, publish, run_bounded


class BudgetContractTest(unittest.TestCase):
    def test_strict_positive_integer_limits(self):
        for value in [{}, {'maxWorkspaceBytes': -1, 'maxTemporaryBytes': 10},
                      {'maxWorkspaceBytes': 1, 'maxTemporaryBytes': 0},
                      {'maxWorkspaceBytes': True, 'maxTemporaryBytes': 10},
                      {'maxWorkspaceBytes': 1, 'maxTemporaryBytes': 10, 'root': '/other'}]:
            with self.subTest(value=value), self.assertRaises(StorageBudgetError):
                parse_budget(value)
        self.assertEqual(parse_budget({'maxWorkspaceBytes': 0, 'maxTemporaryBytes': 10}), StorageBudget(0, 10))

    def test_publish_rejects_links_before_deleting_existing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root, staged = pathlib.Path(directory) / 'durable', pathlib.Path(directory) / 'staged'
            root.mkdir(); staged.mkdir()
            (root / 'original').write_bytes(b'retained')
            (staged / 'escape').symlink_to('/etc/passwd')
            with self.assertRaises(StorageBudgetError):
                publish(root, staged, manifest(root), manifest(staged))
            self.assertEqual((root / 'original').read_bytes(), b'retained')
            self.assertFalse((root / 'escape').exists())

    def test_replace_delete_and_nested_growth(self):
        with tempfile.TemporaryDirectory() as directory:
            root, staged = pathlib.Path(directory) / 'durable', pathlib.Path(directory) / 'staged'
            root.mkdir(); staged.mkdir()
            (root / 'old').write_bytes(b'old'); (root / 'shrink').write_bytes(b'12345678')
            (staged / 'nested').mkdir(); (staged / 'nested' / 'new').write_bytes(b'new')
            (staged / 'shrink').write_bytes(b'1')
            publish(root, staged, manifest(root), manifest(staged))
            self.assertEqual(manifest(root), manifest(staged))
            self.assertFalse(any(p.name.startswith('.workspace-write-') for p in root.rglob('*')))


@unittest.skipUnless(os.environ.get('XPERT_STORAGE_MOUNT_TESTS') == '1', 'Requires the isolated privileged Runner')
class BoundedWorkspaceMountTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='quota-test-', dir='/var/lib/xpert-nsjail')
        self.root = pathlib.Path(self.temporary.name)
        self.workspace = self.root / 'workspace'; self.workspace.mkdir()
        (self.workspace / 'original').write_bytes(b'original')

    def tearDown(self):
        self.temporary.cleanup()

    def test_copy_up_preserves_consumer_ownership_without_relaxing_private_modes(self):
        (self.workspace / 'original').chmod(0o600)
        def inspect(staged, scratch):
            info = (staged / 'original').stat()
            self.assertEqual((info.st_uid, info.st_gid), (10001, 10001))
            self.assertEqual(info.st_mode & 0o777, 0o600)
            self.assertEqual(staged.stat().st_uid, 10001)
            return False
        # Emulate Docker Desktop: root sees root ownership; the consumer sees its UID.
        with mock.patch('bounded_workspace.workspace_ownership', return_value={'': [10001, 10001], 'original': [10001, 10001]}):
            run_bounded(self.workspace, self.root, StorageBudget(100, 1024 * 1024), inspect, bool, (10001, 10001))
        self.assertEqual((self.workspace / 'original').stat().st_uid, 0)
        self.assertEqual((self.workspace / 'original').stat().st_mode & 0o777, 0o600)

    def test_private_subtree_stays_inaccessible_while_public_write_commits(self):
        identity = (10001, 10001)
        self.root.chmod(0o711)
        os.chown(self.workspace, *identity)
        private = self.workspace / 'private'
        private.mkdir(mode=0o700)
        secret = private / 'material'
        secret.write_bytes(b'x' * (2 * 1024 * 1024))
        secret.chmod(0o600)

        def write(staged, scratch):
            self.assertFalse((scratch / 'upper' / 'private').exists())
            subprocess.run([sys.executable, '-I', '-c', """
import pathlib, sys
root = pathlib.Path(sys.argv[1])
for mode in ('rb', 'r+b'):
    try:
        with (root / 'private' / 'material').open(mode):
            raise AssertionError('private file is accessible')
    except PermissionError:
        pass
(root / 'public').write_text('ok')
""", str(staged)], user=identity[0], group=identity[1], extra_groups=[], check=True)
            return True

        self.assertTrue(run_bounded(self.workspace, self.root, StorageBudget(3 * 1024 * 1024, 1024 * 1024),
                                    write, bool, identity))
        self.assertEqual((self.workspace / 'public').read_text(), 'ok')
        self.assertEqual((private.stat().st_uid, private.stat().st_mode & 0o777), (0, 0o700))
        self.assertEqual(secret.read_bytes(), b'x' * (2 * 1024 * 1024))

    def test_search_only_directory_preserves_access_to_known_files(self):
        identity = (10001, 10001)
        self.root.chmod(0o711)
        folder = self.workspace / 'drop'
        folder.mkdir(mode=0o711)
        draft = folder / 'draft'
        draft.write_text('first')
        draft.chmod(0o600)
        os.chown(draft, *identity)

        def edit(staged, scratch):
            self.assertTrue((scratch / 'upper' / 'drop' / 'draft').is_file())
            subprocess.run([sys.executable, '-I', '-c', """
import pathlib, sys
folder = pathlib.Path(sys.argv[1])
try:
    list(folder.iterdir())
    raise AssertionError('search-only directory can be listed')
except PermissionError:
    pass
(folder / 'draft').write_text('edited')
""", str(staged / 'drop')], user=identity[0], group=identity[1], extra_groups=[], check=True)
            return True

        self.assertTrue(run_bounded(self.workspace, self.root, StorageBudget(100, 1024 * 1024), edit, bool, identity))
        self.assertEqual(draft.read_text(), 'edited')
        self.assertEqual((draft.stat().st_uid, draft.stat().st_mode & 0o777), (identity[0], 0o600))

    def test_bounded_upload_checks_jail_permissions_and_rolls_back_the_batch(self):
        import runner

        identity = (10001, 10001)
        self.root.chmod(0o711)
        os.chown(self.workspace, *identity)
        private = self.workspace / 'private'
        private.mkdir(mode=0o700)
        secret = private / 'secret'
        secret.write_bytes(b'original')
        drop = self.workspace / 'drop'
        drop.mkdir(mode=0o711)
        draft = drop / 'draft'
        draft.write_bytes(b'first')
        draft.chmod(0o600)
        os.chown(draft, *identity)

        runtime = runner.Runtime('test-upload', self.workspace, '/workspace')
        handler = mock.Mock()
        budget = {'maxWorkspaceBytes': 1024, 'maxTemporaryBytes': 1024 * 1024}

        def upload(*paths):
            files = [{'path': path, 'contentBase64': base64.b64encode(b'edited').decode()} for path in paths]
            runner.RunnerHandler._handle_runtime(handler, 'POST', runtime, ['files', 'upload'], '',
                                                 {'storageBudget': budget, 'files': files})

        with mock.patch.multiple(runner, STATE_ROOT=self.root, JAIL_UID=identity[0], JAIL_GID=identity[1]):
            with self.assertRaises(StorageBudgetError) as denied:
                upload('/workspace/public', '/workspace/private/secret')
            self.assertEqual(denied.exception.status, 403)
            self.assertFalse((self.workspace / 'public').exists())
            self.assertEqual(secret.read_bytes(), b'original')
            upload('/workspace/public', '/workspace/drop/draft')

        self.assertEqual((self.workspace / 'public').read_bytes(), b'edited')
        self.assertEqual(draft.read_bytes(), b'edited')
        self.assertEqual((draft.stat().st_uid, draft.stat().st_mode & 0o777), (identity[0], 0o600))

    def test_unchanged_directories_do_not_consume_overlay_inodes(self):
        identity = (10001, 10001)
        self.root.chmod(0o711)
        os.chown(self.workspace, *identity)
        # The private tmpfs has 32,768 inodes. Materializing these empty directories would exhaust it.
        for index in range(32768):
            (self.workspace / f'empty-{index}').mkdir()

        def write(staged, scratch):
            subprocess.run([sys.executable, '-I', '-c',
                            "import pathlib, sys; pathlib.Path(sys.argv[1]).write_text('ok')",
                            str(staged / 'public')], user=identity[0], group=identity[1], extra_groups=[], check=True)
            self.assertEqual({p.name for p in (scratch / 'upper').iterdir()}, {'original', 'public'})
            return True

        self.assertTrue(run_bounded(self.workspace, self.root, StorageBudget(100, 1024 * 1024), write, bool, identity))
        self.assertEqual((self.workspace / 'public').read_text(), 'ok')

    def test_over_limit_rolls_back_overwrite_and_new_files(self):
        def write(staged, scratch):
            (staged / 'original').write_bytes(b'changed')
            (staged / 'new').write_bytes(b'too large')
            return True
        with self.assertRaises(StorageBudgetError):
            run_bounded(self.workspace, self.root, StorageBudget(8, 1024 * 1024), write, bool)
        self.assertEqual((self.workspace / 'original').read_bytes(), b'original')
        self.assertFalse((self.workspace / 'new').exists())
        self.assertEqual(list(self.root.iterdir()), [self.workspace])

    def test_temporary_directory_and_overlay_share_a_hard_limit(self):
        def write(staged, scratch):
            (scratch / 'tmp' / 'large').write_bytes(b'x' * (2 * 1024 * 1024))
            return True
        with self.assertRaises(StorageBudgetError):
            run_bounded(self.workspace, self.root, StorageBudget(10 * 1024 * 1024, 1024 * 1024), write, bool)
        self.assertEqual((self.workspace / 'original').read_bytes(), b'original')
        self.assertEqual(list(self.root.iterdir()), [self.workspace])

    def test_successful_growth_and_shrink_commit(self):
        def write(staged, scratch):
            (staged / 'original').write_bytes(b'x')
            (staged / 'new').write_bytes(b'1234567')
            return True
        run_bounded(self.workspace, self.root, StorageBudget(8, 1024 * 1024), write, bool)
        self.assertEqual((self.workspace / 'original').read_bytes(), b'x')
        self.assertEqual((self.workspace / 'new').read_bytes(), b'1234567')

    def test_failed_command_discards_writes(self):
        def write(staged, scratch):
            (staged / 'original').write_bytes(b'partial')
            return False
        self.assertFalse(run_bounded(self.workspace, self.root, StorageBudget(100, 1024 * 1024), write, bool))
        self.assertEqual((self.workspace / 'original').read_bytes(), b'original')

    def test_concurrent_out_of_band_change_is_not_overwritten(self):
        def write(staged, scratch):
            (staged / 'original').write_bytes(b'staged')
            (self.workspace / 'original').write_bytes(b'external')
            return True
        with self.assertRaises(StorageBudgetError):
            run_bounded(self.workspace, self.root, StorageBudget(100, 1024 * 1024), write, bool)
        self.assertEqual((self.workspace / 'original').read_bytes(), b'external')
