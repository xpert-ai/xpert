"""Supervisor entry point. Secrets are read privately, never placed in argv/config."""
import os
from pathlib import Path
import sys
from configuration import child_environment, load
from builds import ensure_build, build_environment
from progress import emit


def main():
    state = Path(sys.argv[1]).resolve()
    config = load(state)
    if (state / 'restore-pending.json').exists():
        raise RuntimeError('Restore is incomplete; resume checkpoint restore before starting services')
    service = sys.argv[2]
    prefix = Path(config['runtime']) / 'bin'
    commands = {
        'postgres': [str(prefix / 'postgres'), '-D', str(state / 'postgres'),
                     '-h', '127.0.0.1', '-p', str(config['ports']['postgres']), '-k', ''],
        'redis': [str(prefix / 'redis-server'), str(state / 'redis.conf')],
        'api': [config['node'], 'tools/scripts/start-api.mjs', '--prepared-build', str(state)],
        'web': [config['corepack'], 'pnpm', 'start:cloud']
    }
    command = commands[service]
    os.chdir(config['platform'])
    env = child_environment(config)
    if service in ('api', 'web'):
        ensure_build(config, service)
    if service == 'web':
        # A finite build avoids retaining a frontend compiler after readiness.
        env = build_environment(config, service)
        command = [config['node'], str(Path(config['scripts']) / 'preview-web.mjs'), str(config['ports']['web'])]
        emit('serve', 'running')
    os.execvpe(command[0], command, env)


if __name__ == '__main__':
    main()
