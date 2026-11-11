"""Only manage the recorded Supervisor generation and its descendant listeners.

PID files alone are not authority: Linux boot/start identity and command/config
must agree before any control RPC, especially after host or container restart.
"""
import json
import os
from pathlib import Path
import re
import shlex
import signal
import socket
import subprocess
import time
import urllib.request

from configuration import child_environment, read_env, SECRET_KEYS
from runtime import atomic_json

SERVICES = ('postgres', 'redis', 'api', 'web')


class ServicePending(RuntimeError):
    """The bounded caller wait ended; its owned service may still be building."""
    def __init__(self, service, pid):
        super().__init__(f'{service} is not ready yet; repeat start to continue waiting')
        self.service = service
        self.pid = pid


def identity(pid):
    try:
        proc = Path('/proc') / str(pid)
        fields = (proc / 'task' / str(pid) / 'stat').read_text().rsplit(') ', 1)[1].split()
        if fields[0] == 'Z':
            return None
        return {'pid': pid, 'startTime': fields[19],
                'bootId': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
                'cwd': str((proc / 'cwd').resolve(strict=True)),
                'command': (proc / 'cmdline').read_bytes().split(b'\0')[:-1]}
    except (OSError, IndexError):
        return None


def serial_identity(pid):
    result = identity(pid)
    if result:
        result['command'] = [part.decode() for part in result['command']]
    return result


def owns_supervisor(config):
    state = Path(config['state'])
    record = state / 'supervisor-identity.json'
    if not record.exists():
        return False
    saved = json.loads(record.read_text())
    current = serial_identity(saved['pid'])
    return current == saved and str(state / 'supervisor.conf') in current['command']


def control(config, *args, check=True):
    if not owns_supervisor(config):
        raise RuntimeError('Supervisor identity is absent or changed; no control action was sent')
    result = subprocess.run([
        config['supervisorctl'], '-c', str(Path(config['state']) / 'supervisor.conf'), *args
    ], capture_output=True, text=True, timeout=45)
    if check and result.returncode:
        raise RuntimeError(f'Supervisor operation {args[0]} failed; inspect private supervisor log')
    return result.stdout.strip()


def start_supervisor(config):
    if owns_supervisor(config):
        return
    if config.get('supervisorMode', 'detached') == 'managed':
        raise RuntimeError('Run the supervise command under a persistent process owner before start; managed mode does not launch a detached Supervisor')
    launch_supervisor(config)


def launch_supervisor(config, foreground=False):
    if owns_supervisor(config):
        if foreground:
            raise RuntimeError('This environment already has a live Supervisor; inspect or stop it before supervising')
        return
    state = Path(config['state'])
    socket_path = state / 'supervisor.sock'
    if len(os.fsencode(socket_path)) >= 104:
        raise RuntimeError('State path is too long for a Unix socket; choose a shorter --state')
    # A stale PID may belong to an unrelated process in a recreated container.
    # Never signal/adopt it; only a live process claiming our config blocks recovery.
    pidfile = state / 'supervisor.pid'
    conf = state / 'supervisor.conf'
    if pidfile.exists():
        current = serial_identity(int(pidfile.read_text().strip()))
        if current and str(conf) in current['command']:
            raise RuntimeError('Unverified live Supervisor PID; refusing to adopt or kill it')
    if socket_path.exists():
        with socket.socket(socket.AF_UNIX) as probe:
            try:
                probe.connect(str(socket_path))
            except (ConnectionRefusedError, FileNotFoundError):
                pass
            else:
                raise RuntimeError('Unverified live Supervisor socket; refusing to replace it')
    socket_path.unlink(missing_ok=True)
    pidfile.unlink(missing_ok=True)
    escape = lambda value: str(value).replace('%', '%%')
    text = f'''[unix_http_server]
file={escape(socket_path)}
chmod=0700
[supervisord]
logfile={escape(state / 'logs/supervisor.log')}
logfile_maxbytes=5MB
logfile_backups=2
pidfile={escape(pidfile)}
childlogdir={escape(state / 'logs')}
directory={escape(config['platform'])}
umask=0077
[rpcinterface:supervisor]
supervisor.rpcinterface_factory=supervisor.rpcinterface:make_main_rpcinterface
[supervisorctl]
serverurl=unix://{escape(socket_path)}
'''
    for service in SERVICES:
        command = shlex.join([config['python'], str(Path(config['scripts']) / 'service.py'), str(state), service])
        text += f'''
[program:{service}]
command={escape(command)}
directory={escape(config['platform'])}
autostart=false
autorestart=false
startsecs=1
startretries=0
stopasgroup=true
killasgroup=true
stopwaitsecs=20
redirect_stderr=true
stdout_logfile={escape(state / 'logs' / (service + '.log'))}
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=2
'''
    conf.write_text(text)
    conf.chmod(0o600)
    command = [config['supervisord'], '-c', str(conf)]
    process = subprocess.Popen([*command, '-n']) if foreground else None
    if not foreground:
        subprocess.run(command, check=True, capture_output=True)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if pidfile.exists() and socket_path.exists():
            current = serial_identity(int(pidfile.read_text().strip()))
            if current and str(conf) in current['command']:
                atomic_json(state / 'supervisor-identity.json', current)
                return process
        time.sleep(0.1)
    if process and process.poll() is None:
        process.terminate()
        process.wait(timeout=30)
    raise RuntimeError('Supervisor did not become ready')


def service_pid(config, name):
    if not owns_supervisor(config):
        return 0
    output = control(config, 'pid', name, check=False)
    return int(output) if output.isdigit() else 0


def assert_port_free(port):
    with socket.socket() as probe:
        # Like the actual servers, permit reuse after graceful shutdown. Closed
        # connections in TIME_WAIT are not an unowned listening service.
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(('127.0.0.1', port))
        except OSError:
            raise RuntimeError(f'Port {port} is occupied by an unowned service') from None


def descendant_pids(root):
    parents = {}
    for entry in Path('/proc').iterdir():
        if entry.name.isdigit():
            try:
                fields = (entry / 'stat').read_text().rsplit(') ', 1)[1].split()
                parents[int(entry.name)] = int(fields[1])
            except (OSError, IndexError, ValueError):
                pass
    found = {root}
    while True:
        expanded = found | {pid for pid, parent in parents.items() if parent in found}
        if expanded == found:
            return found
        found = expanded


def owns_listener(pid, port):
    inodes = set()
    for filename in ('tcp', 'tcp6'):
        for line in (Path('/proc/net') / filename).read_text().splitlines()[1:]:
            fields = line.split()
            if fields[3] == '0A' and int(fields[1].split(':')[1], 16) == port:
                inodes.add('socket:[' + fields[9] + ']')
    if not inodes or not pid:
        return False
    for child in descendant_pids(pid):
        try:
            for fd in (Path('/proc') / str(child) / 'fd').iterdir():
                try:
                    if os.readlink(fd) in inodes:
                        return True
                except OSError:
                    pass
        except OSError:
            pass
    return False


def sql(config, query, database='xpert'):
    env = child_environment(config)
    env['PGPASSWORD'] = env['DB_PASS']
    return subprocess.run([
        str(Path(config['runtime']) / 'bin/psql'), '-X', '-w', '-h', '127.0.0.1',
        '-p', str(config['ports']['postgres']), '-U', 'xpert', '-d', database,
        '-At', '-v', 'ON_ERROR_STOP=1', '-c', query
    ], env=env, capture_output=True, text=True, timeout=30, check=True).stdout.strip()


def healthy(config, name):
    pid = service_pid(config, name)
    if not owns_listener(pid, config['ports'][name]):
        return False
    try:
        if name == 'postgres':
            return sql(config, 'SELECT 1', 'postgres') == '1'
        if name == 'redis':
            env = child_environment(config)
            env['REDISCLI_AUTH'] = env['REDIS_PASSWORD']
            result = subprocess.run([str(Path(config['runtime']) / 'bin/redis-cli'),
                '-h', '127.0.0.1', '-p', str(config['ports'][name]), 'PING'],
                env=env, capture_output=True, text=True, timeout=10)
            return result.returncode == 0 and result.stdout.strip() == 'PONG'
        suffix = '/api/health/ready' if name == 'api' else '/'
        with urllib.request.urlopen(f'http://127.0.0.1:{config["ports"][name]}{suffix}', timeout=5) as response:
            return response.status == 200
    except (OSError, subprocess.SubprocessError):
        return False


def start_service(config, name, timeout):
    if healthy(config, name):
        return
    pid = service_pid(config, name)
    if timeout <= 0:
        raise ServicePending(name, pid)
    if not pid:
        assert_port_free(config['ports'][name])
        control(config, 'start', name)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if healthy(config, name):
            return
        if not service_pid(config, name):
            raise RuntimeError(f'{name} exited; inspect {config["state"]}/logs/{name}.log')
        time.sleep(2)
    pid = service_pid(config, name)
    if not pid:
        raise RuntimeError(f'{name} exited; inspect {config["state"]}/logs/{name}.log')
    raise ServicePending(name, pid)


def stop(config, service=None):
    if not owns_supervisor(config):
        return
    if service:
        if service_pid(config, service):
            control(config, 'stop', service)
        return
    # Reverse dependency order; preserve database contents and installation cache.
    for name in reversed(SERVICES):
        if service_pid(config, name):
            control(config, 'stop', name)
    record = json.loads((Path(config['state']) / 'supervisor-identity.json').read_text())
    control(config, 'shutdown')
    deadline = time.monotonic() + 30
    while serial_identity(record['pid']) == record:
        if time.monotonic() >= deadline:
            raise RuntimeError('Supervisor shutdown timed out; no other process was signalled')
        time.sleep(0.1)


def redacted_tail(config, service, lines=60):
    path = Path(config['state']) / 'logs' / f'{service}.log'
    if not path.exists():
        return ''
    with path.open('rb') as stream:
        stream.seek(max(0, path.stat().st_size - 65536))
        text = stream.read().decode(errors='replace')
    values = read_env(Path(config['platform']) / '.env')
    for key in SECRET_KEYS:
        if values.get(key):
            text = text.replace(values[key], '[redacted]')
    text = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[redacted-token]', text)
    return '\n'.join('[redacted sensitive line]' if re.search(
        r'password|authorization|access.?token|refresh.?token|secret|\bhash\b', line, re.I) else line
        for line in text.splitlines()[-lines:])
