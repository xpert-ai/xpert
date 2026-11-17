"""Keep new checkout dependencies on the persistent Linux disk.

Only the pnpm package store is shared. Each checkout owns its mutable modules;
existing directories/symlinks are preserved rather than migrated on resume.
"""
import hashlib
from pathlib import Path

from runtime import atomic_json


def prepare_dependency_layout(config):
    root = Path(config['platform'])
    modules = root / 'node_modules'
    selected = config.get('dependencyLayout')
    if selected:
        target = Path(selected['nodeModules'])
        linked = modules.is_symlink()
        if ((linked and modules.resolve() != target.resolve())
                or (not linked and modules.exists())):
            raise RuntimeError('Managed dependency layout changed; restore its recorded node_modules link')
        if target.is_symlink() or (target.exists() and not target.is_dir()):
            raise RuntimeError('Managed dependency target changed; restore its recorded directory')
        # A cleared cache is recoverable, but validate ownership before recreating any paths.
        # The empty directory makes bootstrap reject the old receipt and reinstall normally.
        target.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not linked:
            modules.symlink_to(target, target_is_directory=True)
        return selected
    # Do not invalidate a working receipt or move another checkout's dependencies.
    if modules.exists() or modules.is_symlink():
        return None
    cache = Path(config['runtime']).parents[1]
    identity = hashlib.sha256(str(root.resolve()).encode()).hexdigest()[:24]
    target = cache / 'dependencies' / identity / 'node_modules'
    store = Path.home() / '.cache/xpert-pnpm-store'
    for directory in (target, store):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    selected = {'version': 1, 'nodeModules': str(target), 'storeDir': str(store)}
    config['dependencyLayout'] = selected
    atomic_json(Path(config['state']) / 'environment.json', config)
    modules.symlink_to(target, target_is_directory=True)
    return selected


def dependency_environment(config, env):
    selected = config.get('dependencyLayout')
    if selected:
        # Persist the choice so bootstrap, native repairs and later CLI commands agree.
        env['npm_config_store_dir'] = selected['storeDir']
    return env
