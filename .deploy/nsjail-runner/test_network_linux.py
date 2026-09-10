"""Opt-in integration checks; run only in a disposable privileged Runner container.

XPERT_NSJAIL_NETWORK_TEST=1 python3 -m unittest test_network_linux -v
No production Runner, user workspace or real connector credential is used.
"""

import concurrent.futures
import json
import os
import pathlib
import shlex
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

import runner
from network import EgressConfig, NetworkManager


def python_command(source):
    return 'python3 -c ' + shlex.quote(source)


@unittest.skipUnless(os.environ.get('XPERT_NSJAIL_NETWORK_TEST') == '1', 'requires a disposable Linux Runner container')
class NetworkLinuxTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manager = NetworkManager(EgressConfig(enabled=True), runner.STATE_ROOT)
        cls.manager.initialize()
        cls.manager_patch = mock.patch.object(runner, 'NETWORK', cls.manager)
        cls.manager_patch.start()

    @classmethod
    def tearDownClass(cls):
        cls.manager.close()
        cls.manager_patch.stop()
        if cls.manager.active_count:
            raise AssertionError('Network resources remain after cleanup')

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=runner.WORKSPACE_ROOT)
        self.workspace = pathlib.Path(self.directory.name)
        os.chown(self.workspace, runner.JAIL_UID, runner.JAIL_GID)
        self.runtime = runner.Runtime(uuid.uuid4().hex, self.workspace, '/workspace')

    def tearDown(self):
        self.runtime.destroy()
        deadline = time.monotonic() + 5
        while self.manager.active_count and time.monotonic() < deadline:
            self.manager.reap()
            time.sleep(0.05)
        self.directory.cleanup()
        self.assertEqual(self.manager.active_count, 0)
        namespaces = subprocess.check_output(['ip', 'netns', 'list'], text=True)
        self.assertNotIn('xpert-egress-', namespaces)
        links = subprocess.check_output(['ip', '-j', 'link', 'show'], text=True)
        self.assertFalse(any(item['ifname'].startswith('xje') for item in json.loads(links)))

    def execute(self, command, timeout=30000):
        result = runner.execute_command(self.runtime, command, timeout, 16384)
        self.assertEqual(result['exitCode'], 0, result)
        self.assertFalse(result['timedOut'], result)
        return result['output']

    def blocked_packets(self, chain):
        ruleset = json.loads(subprocess.check_output(['nft', '-j', 'list', 'chain', 'inet', 'xpert_egress', chain]))
        return sum(expr['counter']['packets'] for item in ruleset['nftables']
                   for expr in item.get('rule', {}).get('expr', []) if 'counter' in expr)

    def test_execute_reaches_npm_and_feishu_with_node_and_real_dns(self):
        output = self.execute('npm view npm version --fetch-retries=0 --fetch-timeout=15000 && '
                              'node -e "fetch(\'https://open.feishu.cn\').then(r=>console.log(\'FEISHU:\'+r.status))"')
        self.assertRegex(output, r'\d+\.\d+\.\d+')
        self.assertIn('FEISHU:200', output)

    def test_tmpfs_supports_cli_downloads_with_a_finite_limit(self):
        output = self.execute(python_command(f'''
import os, stat
usage = os.statvfs('/tmp')
assert usage.f_blocks * usage.f_frsize == {runner.TMPFS_MB * 1024 * 1024}
assert stat.S_IMODE(os.stat('/tmp').st_mode) == 0o1777
with open('/tmp/download', 'wb') as target:
    target.write(b'x' * (8 * 1024 * 1024))
assert os.stat('/tmp/download').st_size == 8 * 1024 * 1024
print('TMPFS_OK')
'''))
        self.assertIn('TMPFS_OK', output)

    def test_global_npm_install_is_available_to_later_commands(self):
        package = self.workspace / 'fixture'
        package.mkdir()
        (package / 'package.json').write_text(json.dumps({
            'name': 'xpert-test-cli', 'version': '1.0.0', 'bin': {'xpert-test-cli': 'cli.js'},
        }))
        binary = package / 'cli.js'
        binary.write_text("#!/usr/bin/env node\nconsole.log('CLI_ENV_OK')\n")
        binary.chmod(0o755)
        for path in (package, package / 'package.json', binary):
            os.chown(path, runner.JAIL_UID, runner.JAIL_GID)
        self.execute('npm install -g /workspace/fixture --offline --no-audit --no-fund')
        # A fresh jail must discover the install without --prefix or an absolute executable path.
        output = self.execute(
            'test "$(npm root -g)" = /workspace/.npm-global/lib/node_modules && '
            'test "$(command -v xpert-test-cli)" = /workspace/.npm-global/bin/xpert-test-cli && '
            'xpert-test-cli'
        )
        self.assertIn('CLI_ENV_OK', output)
        with tempfile.TemporaryDirectory(dir=runner.WORKSPACE_ROOT) as other_workspace:
            os.chown(other_workspace, runner.JAIL_UID, runner.JAIL_GID)
            other_runtime = runner.Runtime(uuid.uuid4().hex, pathlib.Path(other_workspace), '/workspace')
            try:
                result = runner.execute_command(other_runtime, 'command -v xpert-test-cli', 1000, 1024)
                self.assertNotEqual(result['exitCode'], 0)
            finally:
                other_runtime.destroy()

    def test_live_runner_service_private_metadata_and_ipv6_are_unreachable(self):
        class Canary(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.end_headers()
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('0.0.0.0', 80), Canary)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            # The canary really is listening outside the jail.
            with socket.create_connection(('127.0.0.1', 80), timeout=1):
                pass
            source = '''
import socket, struct
gateway = next(socket.inet_ntoa(struct.pack('<L', int(row.split()[2], 16)))
               for row in open('/proc/net/route').readlines()[1:] if row.split()[1] == '00000000')
targets = [gateway, '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.0.1',
           '169.254.169.254', '100.100.100.200', '168.63.129.16', '::1', '::ffff:127.0.0.1']
for address in targets:
    try:
        with socket.create_connection((address, 80), timeout=.25):
            raise AssertionError('Reached forbidden address: ' + address)
    except OSError:
        pass
print('ALL_BLOCKED')
'''
            runner_drops = self.blocked_packets('input')
            private_drops = self.blocked_packets('from_jail')
            self.assertIn('ALL_BLOCKED', self.execute(python_command(source)))
            self.assertGreater(self.blocked_packets('input'), runner_drops)
            self.assertGreater(self.blocked_packets('from_jail'), private_drops)
        finally:
            server.shutdown()
            server.server_close()

    def test_terminal_uses_its_own_exit_and_releases_it(self):
        terminal = runner.open_terminal(self.runtime, {'cols': 120, 'rows': 24})
        os.write(terminal.master_fd, b"stty -echo\ncurl -fsS --max-time 15 https://registry.npmjs.org/ >/dev/null && printf '\\nTERMINAL_EGRESS_OK\\n'\nexit\n")
        output = ''
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            event = terminal.drain()
            output += event['output']
            if event['exited']:
                break
        self.assertTrue(terminal.exited, output)
        self.assertIn('\r\nTERMINAL_EGRESS_OK\r\n', output)

    def test_managed_service_keeps_preview_and_blocks_another_jail(self):
        source = "fetch('https://registry.npmjs.org/').then(()=>require('http').createServer((q,s)=>s.end('PREVIEW_OK')).listen(8080,'0.0.0.0'))"
        service = runner.start_service(self.runtime, {
            'serviceId': 'web', 'command': 'node -e ' + shlex.quote(source), 'cwd': '/workspace', 'port': 8080,
        })
        self.assertTrue(runner.probe_port(service.process.pid, 8080))
        proxy_payload = json.dumps({'port': 8080, 'method': 'GET', 'path': '/', 'idleTimeoutSeconds': 5})
        proxy = subprocess.run(['nsenter', '--target', str(runner.namespace_pid(service.process.pid)), '--net', '--',
                                'python3', '/app/net_proxy.py'], input=proxy_payload, text=True, capture_output=True)
        self.assertEqual(proxy.returncode, 0, proxy.stderr)
        self.assertIn('PREVIEW_OK', proxy.stdout)
        # The target is live. Its private-destination drop counter must increase,
        # proving isolation rejected the connection before the port filter.
        private_drops = self.blocked_packets('from_jail')
        self.assertIn('ISOLATED', self.execute(python_command(f'''
import socket
try:
    socket.create_connection(({service.network.address!r}, 8080), timeout=.5)
except OSError:
    print('ISOLATED')
else:
    raise AssertionError('Cross-jail connection succeeded')
''')))
        self.assertGreater(self.blocked_packets('from_jail'), private_drops)
        service.stop()

    def test_jail_cannot_modify_the_dns_mount_or_network_policy(self):
        self.assertIn('IMMUTABLE', self.execute(python_command('''
for path in ['/etc/resolv.conf', '/proc/sys/net/ipv4/ip_forward']:
    try:
        with open(path, 'w') as target:
            target.write('0')
    except OSError:
        pass
    else:
        raise AssertionError('Writable network policy: ' + path)
status = open('/proc/self/status').read()
caps = next(line.split()[1] for line in status.splitlines() if line.startswith('CapEff:'))
assert int(caps, 16) == 0, caps
print('IMMUTABLE')
''')))

    def test_timeout_removes_routes_namespaces_and_conntrack(self):
        result = runner.execute_command(self.runtime, 'sleep 30', 100, 1024)
        self.assertTrue(result['timedOut'])
        self.assertEqual(self.manager.active_count, 0)

    def test_concurrent_executions_have_distinct_namespaces(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            outputs = list(executor.map(lambda _: self.execute("readlink /proc/self/ns/net; sleep .2"), range(3)))
        self.assertEqual(len(set(outputs)), 3)
        runner_namespace = os.readlink('/proc/self/ns/net')
        self.assertFalse(any(runner_namespace in output for output in outputs))

    def test_disabled_egress_retains_no_default_route(self):
        with mock.patch.object(runner, 'NETWORK', NetworkManager(EgressConfig(), runner.STATE_ROOT)):
            output = self.execute(python_command("rows=open('/proc/net/route').readlines()[1:]; assert not any(row.split()[1]=='00000000' for row in rows); print('OFFLINE')"))
        self.assertIn('OFFLINE', output)


if __name__ == '__main__':
    unittest.main()
