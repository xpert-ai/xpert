"""Reuse only builds whose source, toolchain, settings and output bytes still match.

The environment owns a cross-process lock; an interrupted/failed build never
publishes a receipt. API reuse does not bypass migration apply/verify on startup.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

from configuration import child_environment, load
from runtime import atomic_json, digest, lock_file

VERSION = 1
OUTPUTS = {
    'web': ('dist/apps/cloud',),
    'api': ('dist/apps/api', 'dist/packages', 'packages/contracts/dist',
            'packages/plugin-sdk/dist', 'packages/plugins/cli-model-profiles/dist'),
}
ENTRY = {'web': 'dist/apps/cloud/browser/index.html', 'api': 'dist/apps/api/main.js'}
BUILD_ENV = ('NODE_ENV', 'NODE_OPTIONS', 'NG_BUILD_MAX_WORKERS', 'NG_BUILD_PARALLEL_TS',
             'NX_DAEMON', 'NX_PARALLEL', 'NX_ISOLATE_PLUGINS', 'CI', 'GOMEMLIMIT', 'GOGC',
             'QEMU_GUEST_BASE', 'TZ')


def build_environment(config, service):
    env = child_environment(config)
    if service == 'web':
        env.update(NODE_OPTIONS='--max-old-space-size=3072', NG_BUILD_MAX_WORKERS='1',
                   NG_BUILD_PARALLEL_TS='0', GOMEMLIMIT='768MiB', GOGC='50')
        env.pop('CI', None)
    return env


def file_record(root, name):
    path = root / name
    if not path.exists():
        return [name, 'missing']
    if not path.is_file():
        raise RuntimeError(f'Build input/output is not a regular file: {name}')
    return [name, digest(path), str(path.resolve()) if path.is_symlink() else None]


def tree_files(root):
    if not root.exists():
        return []
    files = []
    for directory, dirs, names in os.walk(root):
        dirs[:] = sorted(name for name in dirs if name not in ('node_modules', '.git', '__pycache__'))
        for name in sorted(names):
            files.append(Path(directory) / name)
    return files


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def generated_assets(root, service):
    if service != 'api':
        return set()
    project_root = 'packages/server-ai'
    project = json.loads((root / project_root / 'project.json').read_text())
    outputs = project['targets']['build-remote-components']['outputs']
    # These source-tree bundles are owned by the existing Nx build target.
    # Compilation changes them normally; verify their bytes as outputs instead.
    return {str(path.relative_to(root)) for output in outputs
            for path in root.glob(output.replace('{projectRoot}', project_root)) if path.is_file()}


def source_fingerprint(config, service):
    root = Path(config['platform'])
    listed = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root)
    names = set()
    for raw in listed.split(b'\0'):
        if not raw:
            continue
        name = os.fsdecode(raw)
        parts = Path(name).parts
        # Conservative workspace coverage, including dirty and newly added source.
        if parts[0] in ('apps', 'packages', 'tools', 'patches', '.deploy') or len(parts) == 1:
            if not any(part in ('node_modules', 'dist', '__pycache__') for part in parts):
                names.add(name)
    # Ignored generated assets and local configuration also affect the build.
    asset_roots = [root / 'apps/cloud/src/assets'] if service == 'web' else []
    if service == 'api':
        project = json.loads((root / 'apps/api/project.json').read_text())
        for asset in project['targets']['build']['options'].get('assets', []):
            asset_roots.append(root / (asset if isinstance(asset, str) else asset['input']))
    for directory in asset_roots:
        names.update(str(path.relative_to(root)) for path in tree_files(directory))
    names.update(str(path.relative_to(root)) for path in root.glob('.env*') if path.is_file())
    names.update(('pnpm-lock.yaml', 'node_modules/.modules.yaml', 'node_modules/.pnpm/lock.yaml'))
    names.difference_update(generated_assets(root, service))
    env = build_environment(config, service)
    settings = {key: value for key, value in env.items()
                if key in BUILD_ENV or key.startswith(('API_', 'APP_', 'VITE_'))}
    toolchain = subprocess.check_output([config['node'], '-p',
        'JSON.stringify({version:process.version,arch:process.arch,platform:process.platform})'], env=env, text=True).strip()
    return fingerprint({'version': VERSION, 'service': service, 'platform': str(root),
        'files': [file_record(root, name) for name in sorted(names)], 'settings': settings,
        'node': digest(Path(config['node'])), 'toolchain': toolchain,
        'corepack': digest(Path(config['corepack']))})


def output_fingerprint(config, service):
    root = Path(config['platform'])
    if not (root / ENTRY[service]).is_file():
        return None
    names = generated_assets(root, service)
    for output in OUTPUTS[service]:
        directory = root / output
        if not directory.is_dir():
            return None
        names.update(str(path.relative_to(root)) for path in tree_files(directory))
    return fingerprint([file_record(root, name) for name in sorted(names)])


def receipt_path(config, service):
    return Path(config['state']) / 'builds' / (service + '.json')


def check_build(config, service):
    path = receipt_path(config, service)
    try:
        receipt = json.loads(path.read_text())
    except (OSError, ValueError):
        return False, 'receipt_missing'
    if receipt.get('version') != VERSION or receipt.get('service') != service or receipt.get('platform') != config['platform']:
        return False, 'identity_changed'
    if receipt.get('inputs') != source_fingerprint(config, service):
        return False, 'inputs_changed'
    outputs = output_fingerprint(config, service)
    if outputs is None or receipt.get('outputs') != outputs:
        return False, 'outputs_changed'
    return True, 'verified'


def ensure_build(config, service):
    state = Path(config['state'])
    with lock_file(state / 'build.lock'):
        valid, reason = check_build(config, service)
        if valid:
            print(json.dumps({'build': service, 'status': 'reused', 'receipt': str(receipt_path(config, service))}), flush=True)
            return 'reused'
        receipt_path(config, service).unlink(missing_ok=True)
        inputs = source_fingerprint(config, service)
        print(json.dumps({'build': service, 'status': 'building', 'reason': reason}), flush=True)
        env = build_environment(config, service)
        if service == 'api':
            commands = [[config['node'], 'tools/scripts/start-api.mjs', '--build-only']]
        else:
            commands = [[config['corepack'], 'pnpm', 'theme:check-hardcoded-colors'],
                        [config['corepack'], 'pnpm', 'nx', 'build', 'cloud', '--configuration=development-light']]
        for command in commands:
            subprocess.run(command, cwd=config['platform'], env=env, check=True)
        outputs = output_fingerprint(config, service)
        if outputs is None or source_fingerprint(config, service) != inputs:
            raise RuntimeError('Build outputs are missing or inputs changed during compilation; no reusable receipt was saved')
        receipt = {'version': VERSION, 'service': service, 'platform': config['platform'],
                   'inputs': inputs, 'outputs': outputs, 'builtAt': datetime.now(timezone.utc).isoformat()}
        atomic_json(receipt_path(config, service), receipt)
        print(json.dumps({'build': service, 'status': 'built', 'receipt': str(receipt_path(config, service))}), flush=True)
        return 'built'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', required=True)
    parser.add_argument('--state', required=True)
    parser.add_argument('--verify', choices=tuple(OUTPUTS), required=True)
    args = parser.parse_args()
    config = load(Path(args.state).resolve())
    if config['platform'] != str(Path(args.platform).resolve()):
        raise RuntimeError('Build receipt belongs to another checkout')
    valid, reason = check_build(config, args.verify)
    if not valid:
        raise RuntimeError(f'Prepared build is not valid ({reason}); run cli.py build before starting')
    print(json.dumps({'build': args.verify, 'status': 'verified'}))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
        print(str(error) if isinstance(error, RuntimeError) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
