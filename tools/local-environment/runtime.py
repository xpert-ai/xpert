"""User-owned, checksum-locked runtimes. Conda prefixes must never be relocated.

Install in the final prefix under an exclusive lock; publish readiness only after
validation. An interrupted install can be rebuilt without touching environment data.
"""
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parent


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.writing-')
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


@contextlib.contextmanager
def lock_file(path, timeout=1200):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        deadline = time.monotonic() + timeout
        while True:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise RuntimeError(f'Another operation holds {path}')
                time.sleep(0.2)
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def architecture():
    if sys.version_info < (3, 12):
        raise RuntimeError('Process mode requires Python 3.12 or newer.')
    if platform.system() != 'Linux':
        raise RuntimeError('Process mode requires a Linux host, virtual machine or container.')
    machines = {'x86_64': 'linux-64', 'aarch64': 'linux-aarch64'}
    if platform.machine() not in machines:
        raise RuntimeError(f'Unsupported architecture: {platform.machine()}')
    return machines[platform.machine()]


def digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def download(package, directory):
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    filename = package['url'].rsplit('/', 1)[-1]
    target = directory / (package['sha256'] + '-' + filename)
    if target.exists():
        if digest(target) == package['sha256']:
            return target
        # A corrupt cached artifact is never passed to the installer.
        target.unlink()
    if not package['url'].startswith('https://'):
        raise ValueError('Runtime artifacts require HTTPS')
    fd, temporary = tempfile.mkstemp(dir=directory, prefix='.download-')
    try:
        with os.fdopen(fd, 'wb') as output:
            with urllib.request.urlopen(package['url'], timeout=60) as response:
                shutil.copyfileobj(response, output)
        if digest(temporary) != package['sha256']:
            raise RuntimeError(f'Checksum mismatch: {filename}')
        os.replace(temporary, target)
        return target
    finally:
        Path(temporary).unlink(missing_ok=True)


def bootstrap(cache, arch):
    package = json.loads((ROOT / 'locks/bootstrap.json').read_text())[arch]
    target = cache / 'installers' / package['sha256'] / 'micromamba'
    with lock_file(cache / 'installer.lock'):
        archive = download(package, cache / 'downloads')
        with tarfile.open(archive) as bundle:
            member = bundle.getmember('bin/micromamba')
            if not member.isfile():
                raise RuntimeError('Installer archive does not contain a regular executable')
            content = bundle.extractfile(member).read()
        if not target.exists() or target.read_bytes() != content:
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            target.write_bytes(content)
            target.chmod(0o700)
    return target


def install_node(cache, env=None):
    arch = architecture()
    package = json.loads((ROOT / 'locks/node.json').read_text())[arch]
    prefix = cache / 'toolchains' / package['directory']
    with lock_file(cache / 'node.lock'):
        if not (prefix / 'bin/node').exists():
            archive = download(package, cache / 'downloads')
            with tempfile.TemporaryDirectory(dir=cache, prefix='.node-') as temporary:
                with tarfile.open(archive) as bundle:
                    bundle.extractall(temporary, filter='data')
                prefix.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                os.rename(Path(temporary) / package['directory'], prefix)
        version = subprocess.check_output([str(prefix / 'bin/node'), '--version'], env=env, text=True).strip()
        if version != package['version']:
            raise RuntimeError('Installed project Node does not match its version lock')
        if not (prefix / 'bin/corepack').exists():
            raise RuntimeError('Project Node distribution is missing Corepack')
        # Workspace scripts invoke pnpm recursively. The official Node archive
        # includes Corepack but its package-manager shims are not enabled yet.
        subprocess.run([str(prefix / 'bin/node'), str(prefix / 'bin/corepack'),
            'enable', '--install-directory', str(prefix / 'bin')], env=env,
            capture_output=True, check=True)
    return prefix


def install(cache):
    cache = Path(cache).expanduser().resolve()
    arch = architecture()
    locked = (ROOT / 'locks' / f'{arch}.json').read_bytes()
    manifest = json.loads(locked)
    key = hashlib.sha256(locked).hexdigest()[:20]
    prefix = cache / 'runtimes' / key
    marker = prefix / '.xpert-runtime-ready.json'
    with lock_file(cache / f'{key}.lock'):
        if marker.exists():
            verify_runtime(prefix)
            return prefix
        installer = bootstrap(cache, arch)
        packages = manifest['packages']
        with ThreadPoolExecutor(max_workers=4) as pool:
            archives = list(pool.map(lambda p: download(p, cache / 'downloads'), packages))
        # micromamba uses package filenames to identify archive formats/name/version.
        archive_dir = cache / 'packages' / key
        archive_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        lines = ['@EXPLICIT']
        for package, archive in zip(packages, archives):
            link = archive_dir / package['url'].rsplit('/', 1)[-1]
            if link.exists() or link.is_symlink():
                link.unlink()
            os.link(archive, link)
            lines.append(link.as_uri() + '#' + package['md5'])
        spec = archive_dir / 'explicit.txt'
        spec.write_text('\n'.join(lines) + '\n')
        if prefix.exists():
            if prefix.is_symlink():
                raise RuntimeError('Refusing a symlink runtime prefix')
            shutil.rmtree(prefix)
        prefix.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        log = cache / f'install-{key}.log'
        with log.open('w') as stream:
            result = subprocess.run([
                str(installer), '--no-rc', '--root-prefix', str(cache / 'mamba'),
                'create', '--yes', '--offline', '--prefix', str(prefix), '--file', str(spec)
            ], stdout=stream, stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError(f'Runtime installation failed; inspect {log}')
        verify_runtime(prefix)
        atomic_json(marker, {'architecture': arch, 'lock': key, 'versions': manifest['versions']})
        return prefix


def verify_runtime(prefix):
    for binary in ('postgres', 'initdb', 'pg_ctl', 'psql', 'redis-server', 'redis-cli'):
        result = subprocess.run([str(prefix / 'bin' / binary), '--version'], capture_output=True)
        if result.returncode:
            raise RuntimeError(f'Runtime executable {binary} failed its probe (exit {result.returncode})')
    shared = Path(subprocess.check_output([str(prefix / 'bin/pg_config'), '--sharedir'], text=True).strip()).resolve()
    if not shared.is_relative_to(prefix):
        raise RuntimeError('PostgreSQL shared directory points outside its installed prefix')
    for extension in ('vector', 'pgcrypto', 'pg_trgm'):
        if not (shared / 'extension' / f'{extension}.control').is_file():
            raise RuntimeError(f'Runtime is missing PostgreSQL extension {extension}')
