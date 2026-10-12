"""Functional Linux mount probe; run inside an isolated Runner container, never against production data."""
import base64
import os
import pathlib
import shlex
import subprocess
import tempfile

import runner


def main() -> None:
    runner.APP_DATA_MASK.mkdir(mode=0o555, exist_ok=True)
    assert not list(runner.APP_DATA_MASK.iterdir())
    with tempfile.TemporaryDirectory(prefix="app-data-probe-", dir="/sandbox") as temporary:
        workspace = pathlib.Path(temporary)
        os.chown(workspace, runner.JAIL_UID, runner.JAIL_GID)
        os.chmod(workspace, 0o755)
        app = workspace / ".apps" / "meetings"
        app.mkdir(parents=True)
        secret = app / "secret.txt"
        secret.write_text("host-only")
        (workspace / "alias").symlink_to(".apps/meetings", target_is_directory=True)
        runtime = runner.Runtime("a" * 32, workspace, "/workspace")
        source = """
from pathlib import Path
root = Path('/workspace')
assert list((root / '.apps').iterdir()) == []
blocked = 0
for operation in (
    lambda: (root / '.apps/meetings/secret.txt').read_text(),
    lambda: (root / 'alias/secret.txt').read_text(),
    lambda: (root / '.apps/new.txt').write_text('bad'),
    lambda: (root / '.apps').rename(root / 'stolen'),
    lambda: (root / '.apps').rmdir(),
):
    try:
        operation()
    except OSError:
        blocked += 1
assert blocked == 5, blocked
(root / 'public.txt').write_text('allowed')
print('app-data mount isolation passed')
"""
        result = subprocess.run(
            runner.nsjail_args(runtime, "python3 -c " + shlex.quote(source), time_limit_seconds=15),
            capture_output=True, text=True, timeout=20,
        )
        assert result.returncode == 0, (result.returncode, result.stdout, result.stderr)
        assert secret.read_text() == "host-only"
        assert (workspace / "public.txt").read_text() == "allowed"
        assert runner.upload_file(runtime, "/workspace/.apps/meetings/secret.txt", base64.b64encode(b"bad").decode())["error"]
        try:
            runner.read_file_content(runtime, "/workspace/.apps/meetings/secret.txt")
        except runner.RunnerError:
            pass
        else:
            raise AssertionError("file RPC exposed managed data")
        print(result.stdout.strip())
        print("app-data RPC isolation passed")


if __name__ == "__main__":
    main()
