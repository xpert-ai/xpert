"""Xpert-specific migration, initialization and authenticated CLI handoff."""
import json
from datetime import datetime, timezone
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.error
import urllib.request

from configuration import child_environment, write_private
from processes import healthy, sql, start_service, start_supervisor
from runtime import atomic_json, digest, install_node


def infrastructure(config, timeout=120):
    deadline = time.monotonic() + timeout
    state = Path(config['state'])
    prefix = Path(config['runtime']) / 'bin'
    data = state / 'postgres'
    if not (data / 'PG_VERSION').exists():
        if any(data.iterdir()):
            raise RuntimeError('PostgreSQL initialization is incomplete; preserve data and inspect initdb.log')
        with (state / 'logs/initdb.log').open('w') as stream:
            result = subprocess.run([
                str(prefix / 'initdb'), '-D', str(data), '-U', 'xpert',
                '--pwfile', str(state / 'postgres-password'), '--auth-host=scram-sha-256',
                '--auth-local=trust', '--encoding=UTF8', '--locale=C'
            ], stdout=stream, stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError(f'initdb failed; inspect {state}/logs/initdb.log')
    start_supervisor(config)
    start_service(config, 'postgres', max(0, deadline - time.monotonic()))
    if sql(config, "SELECT count(*) FROM pg_database WHERE datname = 'xpert'", 'postgres') == '0':
        sql(config, 'CREATE DATABASE xpert', 'postgres')
    evidence = state / 'database-initialization.json'
    if not evidence.exists():
        tables = int(sql(config, "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"))
        if tables != 0:
            raise RuntimeError('Unrecorded existing application tables; refusing to adopt this database')
        sql(config, 'CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_trgm;')
        atomic_json(evidence, {'emptyBeforeMigrations': True, 'publicTables': tables,
            'serverVersion': sql(config, 'SHOW server_version'),
            'extensions': sql(config, 'SELECT extname || chr(58) || extversion FROM pg_extension ORDER BY extname').splitlines()})
    start_service(config, 'redis', max(0, deadline - time.monotonic()))


def bootstrap_source(config):
    state = Path(config['state'])
    (state / 'source-bootstrap.json').unlink(missing_ok=True)
    node = install_node(Path(config['runtime']).parents[1], env=child_environment(config))
    config['node'] = str(node / 'bin/node')
    config['corepack'] = str(node / 'bin/corepack')
    atomic_json(state / 'environment.json', config)
    steps = [
        ['install', '--frozen-lockfile', '--reporter=append-only'],
        # This optional provider owns a native PTY. Explicitly build only its
        # declared scripts; don't broaden the checkout's install-script policy.
        ['--dir', 'node_modules/node-pty', 'run', 'install'],
        ['--dir', 'node_modules/node-pty', 'run', 'postinstall'],
        ['nx', 'build', 'server'], ['nx', 'build', 'plugin-sdk'],
        ['nx', 'build', 'local-shell-sandbox']
    ]
    log = state / 'logs/bootstrap.log'
    with log.open('a') as stream:
        for args in steps:
            stream.write('STEP: corepack pnpm ' + ' '.join(args) + '\n')
            stream.flush()
            result = subprocess.run([config['corepack'], 'pnpm', *args],
                cwd=config['platform'], env=child_environment(config), stdout=stream, stderr=subprocess.STDOUT)
            if result.returncode:
                raise RuntimeError(f'Source bootstrap failed; inspect {log}')
        result = subprocess.run([config['node'], 'packages/plugins/local-shell-sandbox/tools/check-terminal.cjs'],
            cwd=config['platform'], env=child_environment(config), stdout=stream, stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError(f'Local Shell PTY failed its smoke test; inspect {log}')
    atomic_json(state / 'source-bootstrap.json', {'completed': True, 'platform': config['platform'],
        'revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=config['platform'], text=True).strip(),
        'dependencyLock': digest(Path(config['platform']) / 'pnpm-lock.yaml'), 'ptyVerified': True})


def assert_bootstrapped(config):
    marker = Path(config['state']) / 'source-bootstrap.json'
    if not marker.exists():
        raise RuntimeError('Run bootstrap successfully before starting API/Web')
    built = json.loads(marker.read_text())
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=config['platform'], text=True).strip()
    if built.get('revision') != revision or built.get('dependencyLock') != digest(Path(config['platform']) / 'pnpm-lock.yaml'):
        raise RuntimeError('Checkout or dependency lock changed; run bootstrap before starting API/Web')


def configure_oidc(config):
    """Reuse the platform's idempotent key/client initializer on our owned .env."""
    state = Path(config['state'])
    with (state / 'logs/bootstrap.log').open('a') as stream:
        result = subprocess.run([config['node'], 'tools/scripts/setup-oidc.mjs',
            '--env-file', str(Path(config['platform']) / '.env'),
            '--jwks-file', str(state / 'oidc-jwks.json'),
            '--app-origin', f'http://localhost:{config["ports"]["web"]}',
            '--xpert-origin', f'http://localhost:{config["ports"]["web"]}'],
            cwd=config['platform'], env=child_environment(config),
            stdout=stream, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError('OIDC initialization failed; inspect the private bootstrap log')


def verify_local_terminal(config):
    """Staging intentionally skips npm scripts; opt in only to this selected PTY."""
    state = Path(config['state'])
    store = (state / 'plugins').resolve()
    plugin = (store / 'system_global/@xpert-ai/plugin-local-shell-sandbox/node_modules/@xpert-ai/plugin-local-shell-sandbox').resolve()
    if not plugin.is_relative_to(store):
        raise RuntimeError('Local Shell runtime is outside this environment plugin store')
    manifest = json.loads((plugin / 'package.json').read_text())
    if manifest.get('name') != '@xpert-ai/plugin-local-shell-sandbox':
        raise RuntimeError('Local Shell staged runtime identity does not match')
    command = [config['node'], str(plugin / 'tools/check-terminal.cjs')]
    env = child_environment(config)
    log = state / 'logs/terminal.log'
    with log.open('a') as stream:
        result = subprocess.run(command, cwd=plugin, env=env, stdout=stream, stderr=subprocess.STDOUT)
        if result.returncode:
            # Use the same Node ABI and previously cached headers as bootstrap.
            # No broad allow-scripts change and no untrusted plugin postinstall.
            subprocess.run([str(Path(config['node']).parent / 'npm'), 'rebuild', 'node-pty',
                '--offline', '--ignore-scripts=false', '--package-lock=false', '--foreground-scripts'],
                cwd=plugin, env=env, stdout=stream, stderr=subprocess.STDOUT, check=True)
            result = subprocess.run(command, cwd=plugin, env=env, stdout=stream, stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError(f'Staged Local Shell PTY failed; inspect {log}')
    atomic_json(state / 'terminal-verification.json', {'verified': True, 'pluginPath': str(plugin),
        'pluginVersion': manifest['version'], 'node': config['node'],
        'checkedAt': datetime.now(timezone.utc).isoformat()})


def request(config, route, payload=None, token=None, organization=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if organization:
        headers['Organization-Id'] = organization
    req = urllib.request.Request(
        f'http://127.0.0.1:{config["ports"]["api"]}/api/{route}',
        data=None if payload is None else json.dumps(payload).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        # HTTP responses can contain credentials or account entities; don't echo them.
        raise RuntimeError(f'Xpert {route.split("?")[0]} returned HTTP {error.code}') from None


def login(config):
    credentials = json.loads((Path(config['state']) / 'admin-credentials.json').read_text())
    result = request(config, 'auth/login', {'email': credentials['email'], 'password': credentials['password']})
    if not result.get('token') or result.get('user', {}).get('role', {}).get('name') != 'SUPER_ADMIN':
        raise RuntimeError('Local administrator login did not return the expected role/token')
    request(config, 'auth/alive', token=result['token'])
    return result


def initialize(config, email, name):
    if not healthy(config, 'api'):
        raise RuntimeError('The selected API is not ready')
    state = Path(config['state'])
    credential_path = state / 'admin-credentials.json'
    if not credential_path.exists():
        write_private(credential_path, json.dumps({'email': email, 'password': secrets.token_urlsafe(32)}, indent=2) + '\n')
    credentials = json.loads(credential_path.read_text())
    onboarding = request(config, 'tenant/onboard')
    attempt = state / 'onboarding-attempt.json'
    if not onboarding:
        if attempt.exists():
            raise RuntimeError('Previous onboarding may have partially succeeded; inspect it before retrying')
        atomic_json(attempt, {'requested': True})
        onboarding = request(config, 'tenant/onboard', {
            # Anonymous localhost onboarding/login resolves DEFAULT_TENANT.
            # The caller's display name belongs to the organization instead.
            'name': 'Default Tenant',
            'superAdmin': {'email': credentials['email'], 'hash': credentials['password'],
                          'firstName': 'Local', 'lastName': 'Developer', 'preferredLanguage': 'en'},
            'defaultOrganization': {'name': name, 'preferredLanguage': 'en', 'currency': 'USD',
                'invitesAllowed': True, 'isDefault': True, 'profile_link': '', 'imageUrl': '',
                'client_focus': '', 'defaultValueDateType': 'TODAY', 'bonusType': 'PROFIT_BASED_BONUS', 'tenant': None}
        })
    result = login(config)
    organizations = onboarding.get('organizations', [])
    receipt = {'verified': True, 'checkedAt': datetime.now(timezone.utc).isoformat(), 'email': credentials['email'],
               'tenantId': result['user']['tenantId'], 'userId': result['user']['id'],
               'organizationId': organizations[0]['id'] if organizations else None,
               'credentialsFile': str(credential_path)}
    atomic_json(state / 'administrator.json', receipt)
    return receipt


def run_command(config, command, authenticated=False):
    if command and command[0] == '--':
        command = command[1:]
    if not command:
        raise ValueError('exec requires a command after --')
    env = child_environment(config)
    if authenticated:
        result = login(config)
        env.update({'XPERT_API_URL': f'http://127.0.0.1:{config["ports"]["api"]}',
            'XPERT_TOKEN': result['token'], 'XPERT_TENANT_ID': result['user']['tenantId']})
        administrator = json.loads((Path(config['state']) / 'administrator.json').read_text())
        if administrator.get('organizationId'):
            env['XPERT_ORG_ID'] = administrator['organizationId']
    return subprocess.call(command, cwd=config['platform'], env=env)
