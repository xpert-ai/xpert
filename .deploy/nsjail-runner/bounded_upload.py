"""Run a quota-limited upload batch with the same filesystem permissions as the jail."""
import json
import pathlib
import subprocess
import sys


def upload_as_workspace_user(workspace: pathlib.Path, protected: bool, files: list,
                             uid: int, gid: int, max_file_bytes: int) -> list[dict]:
    result = subprocess.run(
        [sys.executable, '-I', __file__, str(workspace), str(int(protected))],
        user=uid, group=gid, extra_groups=[], cwd='/', check=True,
        env={'XPERT_NSJAIL_UID': str(uid), 'XPERT_NSJAIL_GID': str(gid),
             'XPERT_NSJAIL_MAX_FILE_BYTES': str(max_file_bytes)},
        input=json.dumps(files), capture_output=True, text=True,
    )
    return json.loads(result.stdout)


if __name__ == '__main__':
    # Isolated Python loads the installed Runner code, never modules from the workspace.
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from runner import upload_workspace_files

    results = upload_workspace_files(pathlib.Path(sys.argv[1]), sys.argv[2] == '1', json.load(sys.stdin))
    print(json.dumps(results))
