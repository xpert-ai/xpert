"""Read ownership with the consumer's credentials and never follow workspace links."""
import json
import os
import pathlib
import stat
import subprocess
import sys
from collections.abc import Iterable


def ownership_tree(descriptor: int, paths: Iterable[str]) -> dict[str, list[int]]:
    # The privileged manifest already knows the names. A directory can grant search
    # without granting listing, so look up those names with the consumer's permissions.
    children: dict[str, list[str]] = {}
    for path in paths:
        parent, _, leaf = path.rpartition('/')
        children.setdefault(parent, []).append(leaf)

    root = os.fstat(descriptor)
    owners = {'': [root.st_uid, root.st_gid]}

    def visit(parent_fd: int, parent: str) -> None:
        for leaf in children[parent]:
            try:
                child = os.open(leaf, os.O_PATH | os.O_NOFOLLOW, dir_fd=parent_fd)
            except PermissionError:
                continue
            try:
                info = os.fstat(child)
                path = f'{parent}/{leaf}' if parent else leaf
                if stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode):
                    owners[path] = [info.st_uid, info.st_gid]
                if stat.S_ISDIR(info.st_mode) and path in children and os.access('.', os.X_OK, dir_fd=child, effective_ids=True):
                    visit(child, path)
            finally:
                os.close(child)

    if children:
        visit(descriptor, '')
    return owners


def workspace_ownership(root: pathlib.Path, uid: int, gid: int, paths: Iterable[str]) -> dict[str, list[int]]:
    descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        if (os.geteuid(), os.getegid()) == (uid, gid):
            return ownership_tree(descriptor, paths)
        # Docker Desktop reports the observer as the owner. Copying root's view
        # into a real tmpfs would make a consumer-owned mode-0600 file unreadable.
        result = subprocess.run(
            [sys.executable, '-I', __file__, str(descriptor)],
            pass_fds=(descriptor,), user=uid, group=gid, extra_groups=[],
            cwd='/', input=json.dumps(list(paths)), capture_output=True, text=True, timeout=30, check=True,
        )
        return json.loads(result.stdout)
    finally:
        os.close(descriptor)


if __name__ == '__main__':
    print(json.dumps(ownership_tree(int(sys.argv[1]), json.load(sys.stdin))))
