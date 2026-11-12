"""Cold checkpoints for an explicitly exclusive local development instance.

The CLI holds the environment operation lock. Never copy a live database or
restore source/credentials. Keep the previous state
and a resumable journal; normal service starts refuse a partial restore. This is
local recovery, not a portable backup or a plugin acceptance decision.
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import uuid

from processes import SERVICES, assert_port_free, healthy, service_pid, sql, stop
from runtime import atomic_json, digest

ROOTS = ('postgres', 'redis', 'data', 'public', 'plugins', 'templates')
PENDING = 'restore-pending.json'


def stamp():
    return datetime.now(timezone.utc).isoformat()


def token(value):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', value):
        raise ValueError('Checkpoint name and exclusive project identity must be simple identifiers')
    return value


def private_dir(path):
    if path.is_symlink():
        raise RuntimeError('Refusing a symlink checkpoint directory')
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    path.chmod(0o700)
    return path


def location(config, name):
    root = private_dir(Path(config['state']) / 'checkpoints')
    target = root / token(name)
    if target.is_symlink():
        raise RuntimeError('Refusing a symlink checkpoint')
    return target


def binding(config, project):
    state, platform = Path(config['state']), Path(config['platform'])
    # These files stay in place. Refuse to apply an older data image after changes
    # to credentials/configuration, runtime selection, checkout or dependencies.
    files = [platform / '.env', platform / 'pnpm-lock.yaml',
             state / 'environment.json', state / 'postgres-password',
             state / 'redis.conf', state / 'oidc-jwks.json',
             state / 'admin-credentials.json',
             Path(config['runtime']) / '.xpert-runtime-ready.json']
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=platform, text=True).strip()
    return {'project': token(project), 'platform': str(platform), 'state': str(state),
            'revision': revision, 'files': {str(p): digest(p) if p.exists() else None for p in files}}


def tree(path):
    """Hash bytes and link text without following links or copying special files."""
    if not path.exists() and not path.is_symlink():
        return {'digest': None, 'bytes': 0}
    if path.is_symlink() or not path.is_dir():
        raise RuntimeError('Checkpoint state roots must be ordinary directories')
    result, size = hashlib.sha256(), 0
    def visit(entry):
        nonlocal size
        metadata = entry.lstat()
        relative = str(entry.relative_to(path))
        if stat.S_ISLNK(metadata.st_mode):
            value = ['link', relative, os.readlink(entry)]
        elif stat.S_ISDIR(metadata.st_mode):
            value = ['directory', relative, stat.S_IMODE(metadata.st_mode)]
        elif stat.S_ISREG(metadata.st_mode):
            size += metadata.st_size
            value = ['file', relative, stat.S_IMODE(metadata.st_mode), digest(entry)]
        else:
            raise RuntimeError('Checkpoint state contains a socket or other unsupported special file')
        result.update(json.dumps(value, ensure_ascii=True).encode() + b'\n')
        if stat.S_ISDIR(metadata.st_mode):
            for child in sorted(entry.iterdir()):
                visit(child)
    visit(path)
    return {'digest': result.hexdigest(), 'bytes': size}


def inventory(directory):
    return {name: tree(directory / name) for name in ROOTS}


def validate_links(config):
    state = Path(config['state'])
    for name in ROOTS:
        root = state / name
        if root.is_symlink():
            raise RuntimeError('Checkpoint state roots must not be symlinks')
        if not root.exists():
            continue
        for parent, directories, files in os.walk(root, followlinks=False):
            for item in directories + files:
                path = Path(parent) / item
                if not path.is_symlink():
                    continue
                resolved = path.resolve()
                internal = any(resolved.is_relative_to(state / part) for part in ROOTS)
                host_peer = name == 'plugins' and resolved.is_relative_to(Path(config['platform']))
                if not (internal or host_peer):
                    raise RuntimeError('External state links are unsupported; preserve them with a purpose-built backup')


def stopped(config):
    for name in SERVICES:
        if service_pid(config, name):
            raise RuntimeError('Checkpoint operations require all owned services to be stopped')
        assert_port_free(config['ports'][name])
    data = Path(config['state']) / 'postgres'
    if (data / 'PG_VERSION').exists():
        # A manually launched server can use this data directory on a different
        # port, outside the owned Supervisor. Refuse it; never signal that PID.
        probe = subprocess.run([str(Path(config['runtime']) / 'bin/pg_ctl'), '-D', str(data), 'status'],
                               capture_output=True, timeout=30)
        if probe.returncode == 0:
            raise RuntimeError('PostgreSQL data is still in use outside the stopped owned services')
        if probe.returncode != 3:
            raise RuntimeError('Could not verify that the PostgreSQL data directory is stopped')


def quiesce(config):
    # Keep the verified Supervisor alive; only stop its known children.
    for name in reversed(SERVICES):
        stop(config, name)
    stopped(config)


def database_identity(config, require_clean=True):
    env = os.environ.copy()
    env['LC_ALL'] = 'C'
    output = subprocess.check_output([str(Path(config['runtime']) / 'bin/pg_controldata'),
                                     str(Path(config['state']) / 'postgres')], env=env, text=True, timeout=30)
    values = dict(line.split(':', 1) for line in output.splitlines() if ':' in line)
    if require_clean and values.get('Database cluster state', '').strip() != 'shut down':
        raise RuntimeError('PostgreSQL must have completed a clean shutdown before checkpoint creation')
    identifier = values.get('Database system identifier', '').strip()
    if not identifier.isdigit():
        raise RuntimeError('PostgreSQL system identity is unavailable')
    return identifier


def copy_state(source, destination, expected):
    needed = sum(item['bytes'] for item in expected.values())
    if shutil.disk_usage(destination.parent).free < needed + 16 * 1024 * 1024:
        raise RuntimeError('Insufficient free disk for a complete private checkpoint copy')
    destination.mkdir(mode=0o700)
    for name in ROOTS:
        if expected[name]['digest'] is not None:
            shutil.copytree(source / name, destination / name, symlinks=True)
    if inventory(destination) != expected:
        raise RuntimeError('State changed while copying; no checkpoint or restore was published')


def create(config, name, project):
    state = Path(config['state'])
    if (state / PENDING).exists():
        raise RuntimeError('Resume the pending restore before creating a checkpoint')
    target = location(config, name)
    if target.exists():
        raise RuntimeError('Checkpoint already exists; retain it and choose a new name')
    identity = binding(config, project)
    if not all(healthy(config, service) for service in SERVICES):
        raise RuntimeError('Create a deployment checkpoint from a healthy instance before installing')
    validate_links(config)
    quiesce(config)
    identifier = database_identity(config)
    before = inventory(state)
    temporary = private_dir(target.parent / ('.creating-' + uuid.uuid4().hex))
    # Failed/incomplete copies remain private for diagnosis; never publish them.
    copy_state(state, temporary / 'payload', before)
    stopped(config)
    if inventory(state) != before or binding(config, project) != identity:
        raise RuntimeError('Instance changed during checkpoint creation')
    atomic_json(temporary / 'manifest.json', {'version': 1, 'createdAt': stamp(),
                'binding': identity, 'roots': before, 'databaseSystemIdentifier': identifier})
    os.rename(temporary, target)
    return {'status': 'checkpoint_created', 'checkpoint': name, 'servicesStopped': True,
            'manifestSha256': digest(target / 'manifest.json'), 'acceptancePassed': False,
            'nextAction': 'start; then deploy and self-test the candidate'}


def read_checkpoint(config, name, project):
    target = location(config, name)
    if (target / 'payload').is_symlink() or (target / 'manifest.json').is_symlink():
        raise RuntimeError('Checkpoint payload and manifest must not be symlinks')
    manifest = json.loads((target / 'manifest.json').read_text())
    if not isinstance(manifest, dict) or manifest.get('version') != 1 or manifest.get('binding') != binding(config, project):
        raise RuntimeError('Checkpoint belongs to a different project, configuration, checkout or runtime')
    if set(manifest.get('roots', {})) != set(ROOTS) or inventory(target / 'payload') != manifest['roots']:
        raise RuntimeError('Checkpoint payload is incomplete or has changed')
    return target, manifest


def restore_entry(state, operation, name, entry, expected):
    current, saved, staged = state / name, operation / 'before' / name, operation / 'staged' / name
    if entry['done']:
        if tree(current) != expected:
            raise RuntimeError('Previously restored state changed; refusing to overwrite it')
        return
    if entry['original']['digest'] is not None and not saved.exists():
        if tree(current) != entry['original']:
            raise RuntimeError('State changed before recovery; preserved the pending restore')
        os.rename(current, saved)
    if saved.exists() and tree(saved) != entry['original']:
        raise RuntimeError('Preserved pre-restore state changed')
    if staged.exists():
        if current.exists() or current.is_symlink():
            raise RuntimeError('Unexpected state appeared during restore; refusing to replace it')
        os.rename(staged, current)
    if tree(current) != expected:
        raise RuntimeError('Restored state differs from the checkpoint; resume after inspection')


def restore(config, name, project):
    state = Path(config['state'])
    target, manifest = read_checkpoint(config, name, project)
    pending = state / PENDING
    checkpoint_digest = digest(target / 'manifest.json')
    if pending.exists():
        journal = json.loads(pending.read_text())
        if (not isinstance(journal, dict) or not isinstance(journal.get('operation'), str) or
                not isinstance(journal.get('entries'), dict) or set(journal['entries']) != set(ROOTS) or
                any(not isinstance(entry, dict) or not isinstance(entry.get('done'), bool) or
                    not isinstance(entry.get('original'), dict) or
                    set(entry['original']) != {'digest', 'bytes'} for entry in journal['entries'].values())):
            raise RuntimeError('Restore journal is invalid; preserve it and inspect the retained state')
        if (journal.get('checkpoint') != name or journal.get('project') != project or
                journal.get('manifestSha256') != checkpoint_digest):
            raise RuntimeError('A different restore is pending; resume its original checkpoint')
        operation = target / 'restores' / token(journal['operation'])
        if any(p.is_symlink() for p in (target / 'restores', operation,
                                       operation / 'staged', operation / 'before')):
            raise RuntimeError('Pending restore paths must not be symlinks')
        quiesce(config)
    else:
        validate_links(config)
        quiesce(config)
        # No automatic fallback to an earlier database if the selected one was
        # replaced/reinitialized. SQL is unnecessary when the API cannot boot.
        if database_identity(config, require_clean=False) != manifest['databaseSystemIdentifier']:
            raise RuntimeError('Database identity changed since the checkpoint')
        before = inventory(state)
        last = state / 'last-restore.json'
        if last.exists() and before == manifest['roots']:
            receipt = json.loads(last.read_text())
            if (receipt.get('checkpoint') == name and receipt.get('project') == project and
                    receipt.get('manifestSha256') == checkpoint_digest):
                return receipt
        operation = private_dir(private_dir(target / 'restores') / uuid.uuid4().hex)
        private_dir(operation / 'before')
        copy_state(target / 'payload', operation / 'staged', manifest['roots'])
        stopped(config)
        if inventory(state) != before or binding(config, project) != manifest['binding']:
            raise RuntimeError('Instance changed during restore preparation')
        journal = {'checkpoint': name, 'project': project, 'operation': operation.name,
                   'manifestSha256': checkpoint_digest,
                   'entries': {key: {'original': before[key], 'done': False} for key in ROOTS}}
        atomic_json(pending, journal)
    for key in ROOTS:
        restore_entry(state, operation, key, journal['entries'][key], manifest['roots'][key])
        journal['entries'][key]['done'] = True
        atomic_json(pending, journal)
    if inventory(state) != manifest['roots']:
        raise RuntimeError('Restored files failed verification; services remain stopped')
    receipt = {'status': 'state_restored', 'checkpoint': name, 'project': project,
               'manifestSha256': checkpoint_digest, 'restoredAt': stamp(),
               'previousState': str(operation / 'before'), 'servicesStopped': True,
               'acceptancePassed': False, 'nextAction': 'start, then checkpoint verify and live feature checks'}
    atomic_json(operation / 'result.json', receipt)
    atomic_json(state / 'last-restore.json', receipt)
    pending.unlink()
    return receipt


def verify(config, name, project):
    state = Path(config['state'])
    if (state / PENDING).exists():
        raise RuntimeError('Restore is incomplete; resume it before starting services')
    target, manifest = read_checkpoint(config, name, project)
    receipt = json.loads((state / 'last-restore.json').read_text())
    if (receipt.get('checkpoint') != name or receipt.get('project') != project or
            receipt.get('manifestSha256') != digest(target / 'manifest.json')):
        raise RuntimeError('No completed restore receipt for this checkpoint')
    services = {name: healthy(config, name) for name in SERVICES}
    if not all(services.values()):
        return {'status': 'not_ready', 'services': services, 'acceptancePassed': False,
                'nextAction': 'start and inspect service diagnostics, then repeat checkpoint verify'}
    continuity = sql(config, 'SELECT system_identifier FROM pg_control_system()', 'postgres') == manifest['databaseSystemIdentifier']
    return {'status': 'environment_recovered' if continuity else 'identity_mismatch',
            'checkpoint': name, 'services': services, 'databaseContinuity': continuity,
            'filesVerifiedAtRestore': True, 'acceptancePassed': False,
            'nextAction': 'Check loaded plugin versions and exercise the final candidate through its real application surface'}
