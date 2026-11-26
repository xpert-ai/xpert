"""One explicit retry of a repaired plugin bootstrap in an exclusive instance.

The environment lock is held by cli.py. Preserve the original private snapshot;
never edit plugin configuration, admitted versions or failure evidence.
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import uuid

from processes import assert_port_free, owns_supervisor, service_pid, stop
from runtime import atomic_json


def snapshot_root(config):
    state = Path(config['state']).resolve()
    plugin = state / 'plugins'
    root = plugin / '.runtime-plugin-state'
    if config.get('identity', {}).get('XPERT_PLUGIN_PATH') != str(plugin):
        raise RuntimeError('Plugin storage does not belong to this environment')
    if plugin.is_symlink() or root.is_symlink():
        raise RuntimeError('Refusing linked plugin startup storage')
    return root


def read_snapshot(root, name):
    if not re.fullmatch(r'[a-f0-9]{64}\.json', name):
        raise ValueError('Expected a replica snapshot filename from status')
    file = root / name
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise RuntimeError('Startup snapshot must be a regular file')
        raw = stream.read(16 * 1024 * 1024 + 1)
    if len(raw) > 16 * 1024 * 1024:
        raise RuntimeError('Plugin startup snapshot is too large')
    try:
        value = json.loads(raw)
    except ValueError:
        raise RuntimeError('Plugin startup snapshot is unreadable') from None
    if not isinstance(value, dict):
        raise RuntimeError('Plugin startup snapshot is not an object')
    return file, raw, value


def inspect_snapshots(config):
    root = snapshot_root(config)
    result = []
    if not root.exists():
        return result
    for file in sorted(root.glob('*.json')):
        _, raw, value = read_snapshot(root, file.name)
        failure = value.get('failure')
        result.append({'snapshot': file.name, 'sha256': hashlib.sha256(raw).hexdigest(),
                       'retryRequired': bool(value.get('attempted') or value.get('blocked') or value.get('recovering')),
                       'failure': {key: failure[key] for key in ('pluginName', 'stage', 'code', 'durationMs')
                                   if key in failure} if isinstance(failure, dict) else None})
    return result


def retry_startup(config, name, expected_sha256):
    if not config.get('projectRoot'):
        raise RuntimeError('Offline retry requires a project-exclusive environment')
    if not re.fullmatch(r'[a-f0-9]{64}', expected_sha256):
        raise ValueError('Expected the exact snapshot SHA-256 from status')
    root = snapshot_root(config)
    file, raw, value = read_snapshot(root, name)
    if hashlib.sha256(raw).hexdigest() != expected_sha256:
        raise RuntimeError('Plugin startup snapshot changed; inspect status again')
    if not (value.get('attempted') or value.get('blocked') or value.get('recovering')):
        raise RuntimeError('This snapshot has no blocked startup to retry')
    # Only the verified local Supervisor can stop its own API; unknown listeners
    # or changed process ownership cause refusal before any snapshot mutation.
    if not owns_supervisor(config):
        raise RuntimeError('A verified local Supervisor is required before retry')
    stop(config, 'api')
    if service_pid(config, 'api'):
        raise RuntimeError('API is still running; startup snapshot was not changed')
    assert_port_free(config['ports']['api'])
    _, current, _ = read_snapshot(root, name)
    if current != raw:
        raise RuntimeError('Plugin startup snapshot changed while stopping; inspect again')
    backup = root / (name + '.before-retry-' + uuid.uuid4().hex)
    fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    value.pop('attempted', None)
    value.pop('blocked', None)
    value['recovering'] = False
    atomic_json(file, value)
    receipt = {'status': 'plugin_startup_retry_prepared',
               'at': datetime.now(timezone.utc).isoformat(), 'snapshot': name,
               'beforeSha256': expected_sha256, 'afterSha256': hashlib.sha256(file.read_bytes()).hexdigest(),
               'privateBackup': str(backup), 'service': 'api', 'serviceStarted': False,
               'nextAction': 'start', 'acceptancePassed': False}
    atomic_json(Path(config['state']) / 'plugin-startup-retry.json', receipt)
    return receipt
