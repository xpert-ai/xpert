"""Prepare dependencies once, independently from compilation and Git commit identity.

Reuse is bound to install inputs, Node and the installed layout. Failed installs
never publish a receipt; a failed PTY repair can reuse a completed installation.
Arbitrary edits inside node_modules are unsupported, as with build receipts.
"""
import json
from pathlib import Path
import subprocess

from builds import file_record, fingerprint
from configuration import child_environment
from dependency_layout import prepare_dependency_layout
from progress import emit, phase
from runtime import atomic_json, digest, install_node

VERSION = 2
TERMINAL_CHECK = 'packages/plugins/local-shell-sandbox/tools/check-terminal.cjs'
INSTALL_CONFIG = {'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc',
                  '.pnpmfile.cjs', '.pnpmfile.mjs'}


def dependency_inputs(config):
    root = Path(config['platform'])
    listed = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root)
    names = set(INSTALL_CONFIG)
    for name in listed.decode().split('\0'):
        parts = Path(name).parts
        if not parts or any(part in ('node_modules', 'dist', '.git') for part in parts):
            continue
        if (parts[-1] == 'package.json' or parts[0] == 'patches'
                or name.startswith('tools/scripts/')):
            names.add(name)
    toolchain = subprocess.check_output([config['node'], '-p',
        'JSON.stringify({version:process.version,modules:process.versions.modules,arch:process.arch,platform:process.platform})'],
        env=child_environment(config), text=True).strip()
    return fingerprint({'version': VERSION, 'platform': str(root),
        'files': [file_record(root, name) for name in sorted(names)], 'toolchain': toolchain,
        'node': digest(Path(config['node'])), 'corepack': digest(Path(config['corepack']))})


def installed_layout(config):
    root = Path(config['platform'])
    required = ['node_modules/.modules.yaml', *[
        f'node_modules/{name}/package.json' for name in ('nx', 'typescript', 'node-pty')]]
    if not all((root / name).is_file() for name in required):
        return None
    return fingerprint([file_record(root, name) for name in [*required, 'node_modules/.pnpm/lock.yaml']])


def read_receipt(path):
    try:
        result = json.loads(path.read_text())
        return result if isinstance(result, dict) else {}
    except (OSError, ValueError):
        return {}


def dependency_receipt(config):
    return Path(config['state']) / 'bootstrap' / 'dependencies.json'


def dependencies_match(config, inputs, outputs):
    receipt = read_receipt(dependency_receipt(config))
    return outputs is not None and receipt == {'version': VERSION, 'inputs': inputs, 'outputs': outputs}


def bootstrap_source(config):
    state = Path(config['state'])
    marker = state / 'source-bootstrap.json'
    node = install_node(Path(config['runtime']).parents[1], env=child_environment(config))
    config.update(node=str(node / 'bin/node'), corepack=str(node / 'bin/corepack'))
    atomic_json(state / 'environment.json', config)
    prepare_dependency_layout(config)
    log = state / 'logs/bootstrap.log'
    with log.open('a') as stream:
        def run(args):
            return subprocess.run(args, cwd=config['platform'], env=child_environment(config),
                                  stdout=stream, stderr=subprocess.STDOUT).returncode

        inputs, outputs = dependency_inputs(config), installed_layout(config)
        if dependencies_match(config, inputs, outputs):
            emit('dependencies', 'reused', stream=stream)
        else:
            marker.unlink(missing_ok=True)
            dependency_receipt(config).unlink(missing_ok=True)
            with phase('dependencies', stream):
                if run([config['corepack'], 'pnpm', 'install', '--frozen-lockfile', '--reporter=append-only']):
                    raise RuntimeError(f'Dependency installation failed; inspect {log}')
                outputs = installed_layout(config)
                if outputs is None or dependency_inputs(config) != inputs:
                    raise RuntimeError('Install inputs changed or dependencies are incomplete; no receipt was saved')
                atomic_json(dependency_receipt(config), {'version': VERSION, 'inputs': inputs, 'outputs': outputs})

        # A real smoke test is cheaper and safer than rebuilding a working native module.
        with phase('terminal', stream):
            command = [config['node'], TERMINAL_CHECK]
            if run(command):
                marker.unlink(missing_ok=True)
                for script in ('install', 'postinstall'):
                    if run([config['corepack'], 'pnpm', '--dir', 'node_modules/node-pty', 'run', script]):
                        raise RuntimeError(f'Local Shell PTY repair failed; inspect {log}')
                if run(command):
                    raise RuntimeError(f'Local Shell PTY failed its smoke test; inspect {log}')
        if dependency_inputs(config) != inputs or installed_layout(config) != outputs:
            marker.unlink(missing_ok=True)
            raise RuntimeError('Dependencies changed during bootstrap; retry after inspecting the checkout')
        atomic_json(marker, {'version': VERSION, 'completed': True, 'platform': config['platform'],
            'inputs': inputs, 'outputs': outputs, 'terminalCheck': digest(Path(config['platform']) / TERMINAL_CHECK),
            'ptyVerified': True})


def assert_bootstrapped(config):
    receipt = read_receipt(Path(config['state']) / 'source-bootstrap.json')
    if not receipt.get('completed') or receipt.get('version') != VERSION:
        raise RuntimeError('Run bootstrap successfully before starting API/Web')
    inputs, outputs = dependency_inputs(config), installed_layout(config)
    if (receipt.get('platform') != config['platform'] or receipt.get('inputs') != inputs
            or receipt.get('outputs') != outputs or not dependencies_match(config, inputs, outputs)
            or receipt.get('terminalCheck') != digest(Path(config['platform']) / TERMINAL_CHECK)):
        raise RuntimeError('Dependency inputs, Node or installed layout changed; run bootstrap before starting API/Web')
