"""Use Git's ignore rules for source archives without inventing a repository commit.

An archive must not inherit an enclosing checkout's index. A temporary index lets
the existing env-file protection and source fingerprints work without modifying it.
"""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile


def source_git(root, args, **options):
    root = Path(root).resolve()
    options = {'capture_output': True, **options}
    if (root / '.git').exists():
        return subprocess.run(['git', *args], cwd=root, **options)
    with tempfile.TemporaryDirectory(prefix='xpert-source-index-') as temporary:
        subprocess.run(['git', 'init', '-q', temporary], check=True, capture_output=True)
        return subprocess.run(['git', '--git-dir=' + str(Path(temporary) / '.git'),
                               '--work-tree=' + str(root), *args], cwd=root, **options)


def source_revision(root):
    root = Path(root).resolve()
    if (root / '.git').exists():
        return source_git(root, ['rev-parse', 'HEAD'], check=True, text=True).stdout.strip()
    result = hashlib.sha256()
    names = source_git(root, ['ls-files', '-z', '--others', '--exclude-standard'], check=True).stdout
    for raw in sorted(filter(None, names.split(b'\0'))):
        path = root / os.fsdecode(raw)
        result.update(raw + b'\0')
        result.update(os.fsencode(os.readlink(path)) if path.is_symlink() else path.read_bytes())
        result.update(b'\0')
    return 'archive:sha256:' + result.hexdigest()
