"""Invariants: persistent directories are born with the configured workspace identity.
The privileged Runner never changes its process credentials. All child operations
use pinned directory descriptors and reject symlinks; legacy recovery only touches
the known root-owned .apps mountpoint, never its contents or unrelated owners.
"""
from __future__ import annotations

import errno
import os
import pathlib
import stat
import subprocess
import sys
from dataclasses import dataclass

DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
_CREATE_DIRECTORY = """
import os, sys
try:
    os.mkdir(sys.argv[2], mode=0o755, dir_fd=int(sys.argv[1]))
except FileExistsError:
    pass
except OSError as error:
    print(error.errno)
    sys.exit(1)
"""


@dataclass(frozen=True)
class WorkspaceIdentity:
    uid: int
    gid: int

    def __post_init__(self) -> None:
        if any(type(value) is not int or not 0 <= value < 2**32 - 1 for value in (self.uid, self.gid)):
            raise ValueError('Workspace UID/GID must be valid non-negative numeric identities')

    def matches(self, info: os.stat_result) -> bool:
        return (info.st_uid, info.st_gid) == (self.uid, self.gid)

    def open_directory(self, parent: int, name: str) -> int:
        if not name or name in ('.', '..') or '/' in name or '\\' in name or '\0' in name:
            raise OSError(errno.EINVAL, 'Invalid workspace directory component')
        try:
            return os.open(name, DIRECTORY_FLAGS, dir_fd=parent)
        except FileNotFoundError:
            pass
        if (os.geteuid(), os.getegid()) == (self.uid, self.gid):
            try:
                os.mkdir(name, mode=0o755, dir_fd=parent)
            except FileExistsError:
                pass
        else:
            if os.geteuid() != 0:
                raise PermissionError(errno.EACCES, 'Runner cannot use the configured workspace UID/GID')
            # Popen sets credentials in the child before exec; no preexec_fn or
            # process-wide seteuid in this multithreaded server. mkdir is immediately
            # writable by the API, even when the API races this first creation.
            result = subprocess.run(
                [sys.executable, '-I', '-c', _CREATE_DIRECTORY, str(parent), name],
                pass_fds=(parent,), user=self.uid, group=self.gid, extra_groups=[],
                umask=0, cwd='/', capture_output=True, text=True, timeout=15,
            )
            if result.returncode:
                code = int(result.stdout.strip()) if result.stdout.strip().isdigit() else errno.EIO
                raise OSError(code, 'Cannot initialize directory with the configured workspace UID/GID')
        return os.open(name, DIRECTORY_FLAGS, dir_fd=parent)

    def prepare_app_data(self, workspace: pathlib.Path) -> None:
        parent = os.open(workspace, DIRECTORY_FLAGS)
        try:
            child = self.open_directory(parent, '.apps')
            try:
                info = os.fstat(child)
                # Recover precisely the directory created by the old root Runner.
                # The workspace owner is an additional check, not the source of identity.
                if (not self.matches(info) and os.geteuid() == 0
                        and (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) == (0, 0, 0o755)
                        and self.matches(os.fstat(parent))):
                    os.fchown(child, self.uid, self.gid)
                    info = os.fstat(child)
                if not self.matches(info) or info.st_mode & 0o700 != 0o700:
                    raise PermissionError(errno.EACCES, 'Managed application directory must be writable by the configured workspace UID/GID')
                current = os.stat('.apps', dir_fd=parent, follow_symlinks=False)
                if not stat.S_ISDIR(current.st_mode) or (current.st_dev, current.st_ino) != (info.st_dev, info.st_ino):
                    raise OSError(errno.EAGAIN, 'Managed application directory changed during initialization')
            finally:
                os.close(child)
        finally:
            os.close(parent)
