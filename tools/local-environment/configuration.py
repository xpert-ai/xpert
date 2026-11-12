"""Private configuration for one source checkout; never adopt another .env/database."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile

from runtime import ROOT, atomic_json, architecture, install

SECRET_KEYS = ('DB_PASS', 'REDIS_PASSWORD', 'SESSION_SECRET', 'JWT_SECRET',
               'JWT_REFRESH_SECRET', 'SECRETS_ENCRYPTION_KEY',
               'XPERT_MCP_APP_TOKEN_SECRET', 'XPERT_MCP_REQUEST_STATE_SECRET',
               'OIDC_COOKIE_KEYS', 'OIDC_JWKS')


def read_env(path):
    result = {}
    # Match dotenv's quoted values and inline comments. Exporting the raw
    # template text into a child environment overrides dotenv's own parsing.
    pattern = re.compile(
        r"(?:^|\n)[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*"
        r"(?:'((?:\\.|[^'\\])*)'|\"((?:\\.|[^\"\\])*)\"|`([^`]*)`|([^\r\n#]*))"
    )
    for match in pattern.finditer(Path(path).read_text()):
        single, double, backtick, plain = match.groups()[1:]
        value = next(value for value in (single, double, backtick, plain) if value is not None)
        if double is not None:
            value = value.replace('\\n', '\n').replace('\\r', '\r')
        result[match[1]] = value if plain is None else value.strip()
    return result


def write_private(path, text):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.config-')
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        # Publish complete bytes without overwriting an existing path or symlink.
        os.link(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def default_state(platform_path):
    identity = hashlib.sha256(str(platform_path).encode()).hexdigest()[:12]
    return Path.home() / '.local/share/xpert-dev/environments' / identity


def load(state):
    config = json.loads((state / 'environment.json').read_text())
    if config['state'] != str(state):
        raise RuntimeError('Environment state was moved; restore its original location')
    values = read_env(Path(config['platform']) / '.env')
    if values.get('XPERT_DEV_ENV_STATE') != str(state):
        raise RuntimeError('Source .env does not belong to this environment')
    for key, expected in config['identity'].items():
        if values.get(key) != expected:
            raise RuntimeError(f'Configuration changed for {key}; repair it before managing this environment')
    return config


def finish_prepare(state, config, values):
    source_env = Path(config['platform']) / '.env'
    rendered = ''.join(f'{key}={value}\n' for key, value in values.items())
    files = {
        source_env: rendered,
        state / 'postgres-password': values['DB_PASS'] + '\n',
        state / 'redis.conf': '\n'.join([
            'bind 127.0.0.1', f'port {config["ports"]["redis"]}', 'protected-mode yes',
            f'requirepass {values["REDIS_PASSWORD"]}', f'dir "{state / "redis"}"',
            'appendonly yes', 'daemonize no', 'logfile ""', ''
        ])
    }
    for path, text in files.items():
        if path.is_symlink():
            raise RuntimeError(f'Refusing symlink configuration: {path.name}')
        if path.exists():
            if path.read_text() != text:
                raise RuntimeError(f'Existing {path.name} differs from the saved preparation intent')
        else:
            write_private(path, text)
    atomic_json(state / 'environment.json', config)
    (state / 'prepare-intent.json').unlink(missing_ok=True)


def prepare(args):
    architecture()
    if os.getuid() == 0:
        raise RuntimeError('Run process mode as an ordinary Linux user, not root')
    platform_path = Path(args.platform).expanduser().resolve(strict=True)
    state = Path(args.state).expanduser().resolve() if args.state else default_state(platform_path)
    plugin_root = Path(args.plugin_root or platform_path.parent).expanduser().resolve(strict=True)
    cache = Path(args.cache).expanduser().resolve()
    if any('\n' in str(p) or '\r' in str(p) for p in (platform_path, state, plugin_root, cache)):
        raise ValueError('Paths must not contain newlines')
    for command in ('node', 'corepack', 'git', 'supervisord', 'supervisorctl'):
        if not shutil.which(command):
            raise RuntimeError(f'Missing base tool: {command}')
    ports = {'postgres': args.db_port, 'redis': args.redis_port, 'api': args.api_port, 'web': args.web_port}
    if len(set(ports.values())) != 4 or any(not 1024 <= p <= 65535 for p in ports.values()):
        raise ValueError('Four distinct unprivileged TCP ports are required')
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.chmod(0o700)
    manifest = state / 'environment.json'
    if manifest.exists():
        config = load(state)
        if config['platform'] != str(platform_path) or config['pluginRoot'] != str(plugin_root):
            raise RuntimeError('Existing environment is bound to a different checkout/plugin root')
        # Existing ports and runtime remain authoritative across resumed tasks.
        return state, config
    intent = state / 'prepare-intent.json'
    if intent.exists():
        pending = json.loads(intent.read_text())
        config = pending['config']
        if config['platform'] != str(platform_path) or config['pluginRoot'] != str(plugin_root):
            raise RuntimeError('Pending preparation belongs to a different checkout/plugin root')
        finish_prepare(state, config, pending['env'])
        return state, config
    source_env = platform_path / '.env'
    if source_env.exists() or source_env.is_symlink():
        raise RuntimeError('Source checkout already has .env; use a dedicated checkout')
    subprocess.run(['git', 'check-ignore', '-q', '.env'], cwd=platform_path, check=True)
    prefix = install(cache)
    for folder in ('logs', 'postgres', 'redis', 'sandbox', 'data', 'templates'):
        (state / folder).mkdir(exist_ok=True, mode=0o700)
    template = platform_path / 'docker/env.example'
    values = read_env(template)
    values.update({key: secrets.token_hex(32) for key in SECRET_KEYS if key not in ('OIDC_COOKIE_KEYS', 'OIDC_JWKS')})
    identity = {
        'DB_TYPE': 'postgres', 'DB_HOST': '127.0.0.1', 'DB_PORT': str(ports['postgres']),
        'DB_NAME': 'xpert', 'DB_USER': 'xpert',
        'REDIS_HOST': '127.0.0.1', 'REDIS_PORT': str(ports['redis']),
        'PORT': str(ports['api']), 'WEB_PORT': str(ports['web']),
        'SANDBOX_VOLUME': str(state / 'sandbox'),
        'XPERT_DATA_PATH': str(state / 'data'),
        'XPERT_PUBLIC_PATH': str(state / 'public'),
        'XPERT_PLUGIN_PATH': str(state / 'plugins'),
        'PLUGIN_WORKSPACE_ROOTS': ','.join(dict.fromkeys([
            str(plugin_root), str(platform_path / 'packages/plugins'), str(platform_path / 'dist/packages/plugins')
        ]))
    }
    values.update(identity)
    values.update({
        'NODE_ENV': 'development', 'XPERT_DEV_ENV_STATE': str(state),
        'API_BASE_URL': f'http://localhost:{ports["api"]}',
        'VITE_API_BASE_URL': f'http://localhost:{ports["api"]}',
        'CLIENT_BASE_URL': f'http://localhost:{ports["web"]}',
        'OIDC_ISSUER_BASE_URL': f'http://localhost:{ports["api"]}',
        'OIDC_JWKS_FILE': str(state / 'oidc-jwks.json'),
        'OIDC_JWKS': '', 'OIDC_COOKIE_SAME_SITE': 'lax',
        'CORS_ALLOW_ORIGINS': f'http://localhost:{ports["web"]},http://127.0.0.1:{ports["web"]}',
        'LOG_DIR': str(state / 'logs'), 'LOG_FILE_PATH': str(state / 'logs/platform.log'),
        'XPERT_TEMPLATE_DIR': str(state / 'templates'),
        'XPERT_LOCAL_SANDBOX_ENABLED': 'true', 'NSJAIL_RUNNER_URL': '', 'NSJAIL_RUNNER_TOKEN': '',
        'PLUGINS': '', 'DEPLOYMENT_TARGET': 'local', 'DEMO': 'false'
    })
    config = {
        'version': 1, 'mode': 'process', 'state': str(state), 'platform': str(platform_path),
        'pluginRoot': str(plugin_root), 'runtime': str(prefix), 'ports': ports, 'identity': identity,
        'supervisorMode': getattr(args, 'supervisor_mode', 'managed'),
        'scripts': str(ROOT), 'python': shutil.which('python3'),
        'node': shutil.which('node'), 'corepack': shutil.which('corepack'),
        'supervisord': shutil.which('supervisord'), 'supervisorctl': shutil.which('supervisorctl')
    }
    # Preserve an explicitly supplied emulator setting across detached starts and
    # container recreation. Native hosts need no QEMU-specific configuration.
    guest_base = os.environ.get('QEMU_GUEST_BASE')
    if guest_base:
        if not re.fullmatch(r'0x[0-9a-fA-F]+', guest_base):
            raise ValueError('QEMU_GUEST_BASE must be a hexadecimal address')
        config['processEnvironment'] = {'QEMU_GUEST_BASE': guest_base}
    # Write a recoverable intent before publishing the source configuration.
    atomic_json(intent, {'config': config, 'env': values})
    finish_prepare(state, config, values)
    return state, config


def child_environment(config):
    env = os.environ.copy()
    env.pop('VSCODE_INSPECTOR_OPTIONS', None)
    env.update(read_env(Path(config['platform']) / '.env'))
    env.update(config.get('processEnvironment', {}))
    env.update({
        'PATH': os.pathsep.join([str(Path(config['node']).parent), str(Path(config['runtime']) / 'bin'), env['PATH']]),
        'NODE_ENV': 'development', 'NODE_OPTIONS': '--max-old-space-size=4096',
        'NX_DAEMON': 'false', 'NX_PARALLEL': '1', 'NG_BUILD_MAX_WORKERS': '2',
        'COREPACK_ENABLE_DOWNLOAD_PROMPT': '0', 'CI': 'true',
        'CYPRESS_INSTALL_BINARY': '0', 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD': '1'
    })
    return env
