import os
import pathlib
import tempfile
import unittest
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
