import subprocess
import tempfile
from pathlib import Path
import unittest

from source_checkout import source_git, source_revision


class SourceCheckoutTests(unittest.TestCase):
    def test_archive_preserves_ignore_protection_and_tracks_source_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.gitignore').write_text('.env\nnode_modules/\ndist/\n')
            (root / 'main.py').write_text('value = 1\n')
            source_git(root, ['check-ignore', '-q', '.env'], check=True)
            before = source_revision(root)
            self.assertTrue(before.startswith('archive:sha256:'))
            (root / '.env').write_text('private')
            self.assertEqual(before, source_revision(root))
            (root / 'main.py').write_text('value = 2\n')
            self.assertNotEqual(before, source_revision(root))
            self.assertFalse((root / '.git').exists())
            (root / '.gitignore').write_text('dist/\n')
            with self.assertRaises(subprocess.CalledProcessError):
                source_git(root, ['check-ignore', '-q', '.env'], check=True)

    def test_archive_does_not_use_the_enclosing_repository_index(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            subprocess.run(['git', 'init', '-q', directory], check=True)
            root = parent / 'snapshot'
            root.mkdir()
            (root / 'file.txt').write_text('archive')
            self.assertEqual(source_git(root, ['ls-files', '--others'], check=True, text=True).stdout, 'file.txt\n')
            self.assertTrue(source_revision(root).startswith('archive:sha256:'))


if __name__ == '__main__':
    unittest.main()
