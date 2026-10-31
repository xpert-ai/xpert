"""Real quota protocol and non-root NsJail probe in a disposable workspace."""
import base64
import json
import os
import pathlib
import tempfile
import uuid
from poc_validate import RunnerClient, WORKSPACE_ROOT, JAIL_UID, JAIL_GID


def main():
    client = RunnerClient()
    assert client.json('GET', '/health')['capabilities']['storageBudget']
    with tempfile.TemporaryDirectory(prefix='storage-budget-probe-', dir=WORKSPACE_ROOT) as directory:
        workspace = pathlib.Path(directory)
        os.chown(workspace, JAIL_UID, JAIL_GID)
        os.chmod(workspace, 0o755)
        (workspace / 'project.md').write_text('protected')
        (workspace / 'skills').mkdir()
        (workspace / '.apps').mkdir()
        (workspace / '.apps' / 'secret').write_text('host-only')
        runtime = uuid.uuid4().hex
        route = f'/v1/runtimes/{runtime}'
        client.json('POST', '/v1/runtimes', {'runtimeId': runtime, 'workspacePath': str(workspace),
            'workingDirectory': '/workspace', 'protectProjectContent': True}, expect_status=201)
        budget = {'maxWorkspaceBytes': 32, 'maxTemporaryBytes': 1024 * 1024}
        def execute(command, status=200):
            return client.json('POST', route + '/exec', {'command': command, 'storageBudget': budget,
                'timeoutMs': 10000, 'maxOutputBytes': 4096}, expect_status=status)
        try:
            result = execute('test "$(id -u)" = 1000 && printf abc > result.txt && printf temp > /tmp/test && printf run > /run/test')
            assert result['exitCode'] == 0, result
            assert (workspace / 'result.txt').read_text() == 'abc'
            assert (workspace / 'result.txt').stat().st_uid == JAIL_UID
            repeated = execute('printf def >> result.txt')
            assert repeated['exitCode'] == 0, repeated
            assert (workspace / 'result.txt').read_text() == 'abcdef'
            execute('printf changed > result.txt; head -c 33 /dev/zero > overflow', 507)
            assert (workspace / 'result.txt').read_text() == 'abcdef'
            assert not (workspace / 'overflow').exists()
            assert execute('printf changed > result.txt; exit 1')['exitCode'] == 1
            assert (workspace / 'result.txt').read_text() == 'abcdef'
            result = execute('head -c 2097152 /dev/zero > /tmp/too-large')
            assert result['exitCode'] != 0, result
            assert execute('test ! -f /tmp/too-large && test ! -f /run/test')['exitCode'] == 0
            assert execute('printf bad > project.md')['exitCode'] != 0
            assert execute('printf bad > .apps/secret')['exitCode'] != 0
            assert (workspace / 'project.md').read_text() == 'protected'
            assert (workspace / '.apps/secret').read_text() == 'host-only'
            _, _, body = client.request('POST', route + '/exec/stream', {'command': 'head -c 33 /dev/zero > overflow',
                'storageBudget': budget, 'timeoutMs': 10000, 'maxOutputBytes': 4096})
            events = [json.loads(line) for line in body.decode().splitlines()]
            assert events[-1]['type'] == 'error' and events[-1]['status'] == 507, events
            client.request('POST', route + '/files/upload', {'storageBudget': budget, 'files': [
                {'path': '/workspace/result.txt', 'contentBase64': base64.b64encode(b'x' * 33).decode()}]}, expect_status=507)
            assert (workspace / 'result.txt').read_text() == 'abcdef'
            print('PASS: non-root persistence, account overflow rollback, failed-command rollback, temporary hard limit, cleanup, protected files, streamed and upload errors')
        finally:
            client.request('DELETE', route, expect_status=(204, 404))


if __name__ == '__main__':
    main()
