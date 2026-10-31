"""Stage untrusted writes on a bounded tmpfs; validate before publishing durable bytes.
The host supplies an allowance derived from an account usage snapshot. The runner
serializes each workspace and rejects concurrent out-of-band changes; mount failure
never falls back to unbounded writes.
"""
from __future__ import annotations

import hashlib
import os
import pathlib
import shutil
import stat
import subprocess
import tempfile
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Callable, Iterator, TypeVar

T = TypeVar('T')
_LOCKS: dict[str, threading.RLock] = {}
_LOCKS_GUARD = threading.Lock()
MAX_SAFE_INTEGER = 9007199254740991


class StorageBudgetError(Exception):
    def __init__(self, message: str, status: int = 507):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class StorageBudget:
    workspace_bytes: int
    temporary_bytes: int


def parse_budget(value: object) -> StorageBudget | None:
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {'maxWorkspaceBytes', 'maxTemporaryBytes'}:
        raise StorageBudgetError('Invalid storage budget', 400)
    workspace, temporary = value['maxWorkspaceBytes'], value['maxTemporaryBytes']
    if (type(workspace) is not int or type(temporary) is not int or
            not 0 <= workspace <= MAX_SAFE_INTEGER or not 0 < temporary <= MAX_SAFE_INTEGER):
        raise StorageBudgetError('Invalid storage budget', 400)
    return StorageBudget(workspace, temporary)


@dataclass(frozen=True)
class Entry:
    kind: str
    size: int = 0
    digest: str = ''


def manifest(root: pathlib.Path) -> dict[str, Entry]:
    result: dict[str, Entry] = {}

    def visit(descriptor: int, prefix: str = '') -> None:
        for item in os.scandir(descriptor):
            name = f'{prefix}/{item.name}' if prefix else item.name
            info = item.stat(follow_symlinks=False)
            if stat.S_ISDIR(info.st_mode):
                child = os.open(item.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
                try:
                    opened = os.fstat(child)
                    if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                        raise StorageBudgetError('Workspace changed during inspection', 409)
                    result[name] = Entry('directory')
                    visit(child, name)
                finally:
                    os.close(child)
            elif stat.S_ISREG(info.st_mode):
                digest = hashlib.sha256()
                fd = os.open(item.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=descriptor)
                with os.fdopen(fd, 'rb') as source:
                    opened = os.fstat(source.fileno())
                    if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                        raise StorageBudgetError('Workspace changed during inspection', 409)
                    for chunk in iter(lambda: source.read(1024 * 1024), b''):
                        digest.update(chunk)
                    final = os.fstat(source.fileno())
                    if (final.st_size, final.st_mtime_ns) != (opened.st_size, opened.st_mtime_ns):
                        raise StorageBudgetError('Workspace changed during inspection', 409)
                result[name] = Entry('file', final.st_size, digest.hexdigest())
            elif stat.S_ISLNK(info.st_mode):
                result[name] = Entry('link', info.st_size, os.readlink(item.name, dir_fd=descriptor))
            else:
                raise StorageBudgetError('Unsupported workspace entry', 403)
    descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        visit(descriptor)
    finally:
        os.close(descriptor)
    return result


@contextmanager
def parent_fd(root: pathlib.Path, relative: str, create: bool = False) -> Iterator[tuple[int, str]]:
    parts = pathlib.PurePosixPath(relative).parts
    if not parts or any(part in ('', '.', '..', '/') for part in parts):
        raise StorageBudgetError('Invalid workspace path', 403)
    descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in parts[:-1]:
            if create:
                try:
                    os.mkdir(part, mode=0o755, dir_fd=descriptor)
                except FileExistsError:
                    pass
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        yield descriptor, parts[-1]
    finally:
        os.close(descriptor)


def publish(root: pathlib.Path, staged: pathlib.Path, before: dict[str, Entry], after: dict[str, Entry]) -> None:
    changed = {name for name in before.keys() | after.keys() if before.get(name) != after.get(name)}
    # Never persist new links, special files, or hidden atomic-write artifacts.
    for name in changed:
        if after.get(name, Entry('missing')).kind == 'link' or any(
                part.lower().startswith('.workspace-write-') for part in pathlib.PurePosixPath(name).parts):
            raise StorageBudgetError('Unsupported workspace entry', 403)
    for name in sorted(changed):
        old, new = before.get(name), after.get(name)
        if old and old.kind != 'directory' and (new is None or new.kind == 'directory'):
            with parent_fd(root, name) as (fd, leaf):
                os.unlink(leaf, dir_fd=fd)
    for name in sorted(changed, key=lambda value: (-len(pathlib.PurePosixPath(value).parts), value)):
        old, new = before.get(name), after.get(name)
        if old and old.kind == 'directory' and (new is None or new.kind != 'directory'):
            with parent_fd(root, name) as (fd, leaf):
                os.rmdir(leaf, dir_fd=fd)
    for name in sorted(changed, key=lambda value: (len(pathlib.PurePosixPath(value).parts), value)):
        if after.get(name, Entry('missing')).kind == 'directory':
            with parent_fd(root, name, True) as (fd, leaf):
                try:
                    os.mkdir(leaf, mode=0o755, dir_fd=fd)
                    info = os.stat(staged / name, follow_symlinks=False)
                    child = os.open(leaf, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                    try:
                        os.fchmod(child, stat.S_IMODE(info.st_mode) & 0o777)
                        os.chown(leaf, info.st_uid, info.st_gid, dir_fd=fd, follow_symlinks=False)
                    finally:
                        os.close(child)
                except FileExistsError:
                    pass
    files = [name for name in changed if after.get(name, Entry('missing')).kind == 'file']
    # Shrink before growth so the durable total never exceeds the validated final size.
    for name in sorted(files, key=lambda value: after[value].size - before.get(value, Entry('missing')).size):
        with parent_fd(root, name, True) as (fd, leaf):
            temporary = '.workspace-write-' + os.urandom(16).hex() + '.tmp'
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
            try:
                info = os.stat(staged / name, follow_symlinks=False)
                os.fchmod(descriptor, stat.S_IMODE(info.st_mode) & 0o777)
                with os.fdopen(descriptor, 'wb') as destination, open(staged / name, 'rb') as source:
                    shutil.copyfileobj(source, destination, 1024 * 1024)
                    destination.flush()
                    os.fsync(destination.fileno())
                # Some host bind filesystems cache a new descriptor's ownership.
                # Apply ownership through the pinned parent after closing the file.
                os.chown(temporary, info.st_uid, info.st_gid, dir_fd=fd, follow_symlinks=False)
                os.replace(temporary, leaf, src_dir_fd=fd, dst_dir_fd=fd)
                os.fsync(fd)
            finally:
                try:
                    os.unlink(temporary, dir_fd=fd)
                except FileNotFoundError:
                    pass


def run_bounded(workspace: pathlib.Path, state_root: pathlib.Path, budget: StorageBudget,
                operation: Callable[[pathlib.Path, pathlib.Path], T], accept: Callable[[T], bool]) -> T:
    if any(character in str(workspace) + str(state_root) for character in (',', ':', '\\', '\n')):
        raise StorageBudgetError('Unsupported workspace mount path', 400)
    with _LOCKS_GUARD:
        lock = _LOCKS.setdefault(str(workspace), threading.RLock())
    with lock:
        before = manifest(workspace)
        directory = pathlib.Path(tempfile.mkdtemp(prefix='storage-budget-', dir=state_root))
        # NsJail resolves bind sources after entering its user namespace.
        # Allow traversal without exposing a listing of the staging directory.
        directory.chmod(0o711)
        scratch, merged = directory / 'scratch', directory / 'merged'
        scratch.mkdir()
        merged.mkdir()
        mounted_scratch = mounted_merged = False
        try:
            subprocess.run(['mount', '-t', 'tmpfs', '-o',
                            f'size={budget.temporary_bytes},nr_inodes=32768,mode=0755,nosuid,nodev',
                            'tmpfs', str(scratch)], check=True, capture_output=True)
            mounted_scratch = True
            for name in ('upper', 'work', 'tmp', 'run'):
                (scratch / name).mkdir(mode=0o777)
            owner = workspace.stat()
            os.chown(scratch / 'upper', owner.st_uid, owner.st_gid)
            os.chmod(scratch / 'upper', stat.S_IMODE(owner.st_mode) & 0o777)
            os.chmod(scratch / 'tmp', 0o1777)
            os.chmod(scratch / 'run', 0o1777)
            subprocess.run(['mount', '-t', 'overlay', 'overlay', '-o',
                            f'lowerdir={workspace},upperdir={scratch}/upper,workdir={scratch}/work,nosuid,nodev',
                            str(merged)], check=True, capture_output=True)
            mounted_merged = True
            # Host bind filesystems can reject overlay copy-up by a non-root jail
            # even when the file's owner has write access. Materialize existing
            # files as the host, within the same hard temporary cap, before entry.
            for name, entry in before.items():
                if entry.kind == 'file':
                    with parent_fd(merged, name) as (parent, leaf):
                        descriptor = os.open(leaf, os.O_RDWR | os.O_NOFOLLOW, dir_fd=parent)
                        try:
                            first = os.read(descriptor, 1)
                            if first:
                                os.pwrite(descriptor, first, 0)
                            else:
                                os.ftruncate(descriptor, 0)
                        finally:
                            os.close(descriptor)
            result = operation(merged, scratch)
            if not accept(result):
                return result
            after = manifest(merged)
            if sum(entry.size for entry in after.values()) > budget.workspace_bytes:
                raise StorageBudgetError('Storage limit exceeded')
            if manifest(workspace) != before:
                raise StorageBudgetError('Workspace changed during execution', 409)
            publish(workspace, merged, before, after)
            return result
        except OSError as error:
            if error.errno in (28, 122):
                raise StorageBudgetError('Storage limit exceeded') from error
            raise
        finally:
            # Never recursively remove a directory while its overlay remains mounted.
            if mounted_merged:
                subprocess.run(['umount', str(merged)], check=True, capture_output=True)
            if mounted_scratch:
                subprocess.run(['umount', str(scratch)], check=True, capture_output=True)
            shutil.rmtree(directory)
