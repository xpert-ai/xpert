"""Per-process network namespaces with a Runner-owned, public-web-only exit.

Firewall rules live outside the jail's user namespace. No RPC or jail command
can change them. Failed setup never falls back to the Runner network, and an
address is not reused until its interface, namespace and conntrack are removed.
"""

from __future__ import annotations

import ipaddress
import json
import os
import pathlib
import signal
import subprocess
import sys
import threading
import uuid
from dataclasses import dataclass
from typing import Mapping

DEFAULT_POOL = ipaddress.IPv4Network('100.127.0.0/16')
# Non-public destinations, including cloud control/metadata endpoints. IPv6 is
# denied at the exit rather than allowing mapped IPv4 or transition mechanisms.
BLOCKED = tuple(ipaddress.IPv4Network(value) for value in (
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
    '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
    '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
    '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4', '168.63.129.16/32',
))


class NetworkError(RuntimeError):
    pass


def run_command(args: list[str], *, input_text: str | None = None, no_entries_ok: bool = False) -> str:
    try:
        result = subprocess.run(args, input=input_text, text=True, capture_output=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise NetworkError(f'Network helper {args[0]} failed: {error}') from error
    # conntrack returns 1 when its delete filter matched no flows.
    if result.returncode and not (no_entries_ok and result.returncode == 1 and '0 flow entries' in result.stderr):
        raise NetworkError(f'Network helper {args[0]} failed: {result.stderr.strip()[:512]}')
    return result.stdout


def enable_forwarding() -> None:
    pathlib.Path('/proc/sys/net/ipv4/ip_forward').write_text('1\n')


@dataclass(frozen=True)
class EgressConfig:
    enabled: bool = False
    dns_servers: tuple[str, ...] = ('1.1.1.1', '8.8.8.8')
    pool: ipaddress.IPv4Network = DEFAULT_POOL

    def __post_init__(self):
        private_pools = ('10.0.0.0/8', '100.64.0.0/10', '172.16.0.0/12', '192.168.0.0/16')
        if not 16 <= self.pool.prefixlen <= 24 or not any(
            self.pool.subnet_of(ipaddress.IPv4Network(cidr)) for cidr in private_pools
        ):
            raise ValueError('NsJail egress CIDR must be a private IPv4 /16 to /24 network')
        if not self.dns_servers or len(self.dns_servers) > 3:
            raise ValueError('NsJail egress requires one to three public IPv4 DNS servers')
        for value in self.dns_servers:
            address = ipaddress.IPv4Address(value)
            if any(address in network for network in BLOCKED):
                raise ValueError('NsJail egress DNS must be a public IPv4 address')

    @classmethod
    def from_environment(cls, env: Mapping[str, str] = os.environ) -> EgressConfig:
        enabled = env.get('XPERT_NSJAIL_EGRESS_ENABLED', 'false').lower()
        if enabled not in ('true', 'false'):
            raise ValueError('XPERT_NSJAIL_EGRESS_ENABLED must be true or false')
        dns = tuple(value.strip() for value in env.get('XPERT_NSJAIL_EGRESS_DNS', '1.1.1.1,8.8.8.8').split(','))
        pool = ipaddress.IPv4Network(env.get('XPERT_NSJAIL_EGRESS_CIDR', str(DEFAULT_POOL)))
        return cls(enabled == 'true', dns, pool)


class NetworkLease:
    def __init__(self, manager: NetworkManager, slot: int):
        self.manager = manager
        self.slot = slot
        suffix = uuid.uuid4().hex[:10]
        self.namespace = 'xpert-egress-' + suffix
        self.interface = 'xje' + suffix
        self.peer = 'xjp' + suffix
        self.gateway = str(manager.config.pool.network_address + slot * 4 + 1)
        self.address = str(manager.config.pool.network_address + slot * 4 + 2)
        self.resolv_conf = manager.state_root / (self.namespace + '.resolv.conf')
        self.namespace_created = False
        self.interface_created = False
        self.closing = False
        self.closed = False
        self.lock = threading.RLock()

    def setup(self) -> None:
        self.resolv_conf.write_text(''.join(f'nameserver {server}\n' for server in self.manager.config.dns_servers)
                                    + 'options timeout:2 attempts:2\n')
        self.resolv_conf.chmod(0o444)
        run_command(['ip', 'netns', 'add', self.namespace])
        self.namespace_created = True
        run_command(['ip', 'link', 'add', self.interface, 'type', 'veth', 'peer', 'name', self.peer])
        self.interface_created = True
        run_command(['ip', 'link', 'set', self.peer, 'netns', self.namespace])
        run_command(['ip', 'address', 'add', self.gateway + '/30', 'dev', self.interface])
        run_command(['ip', '-n', self.namespace, 'address', 'add', self.address + '/30', 'dev', self.peer])
        # Bring links up only after the namespace and Runner firewall are ready.
        run_command(['ip', '-n', self.namespace, 'link', 'set', 'lo', 'up'])
        run_command(['ip', '-n', self.namespace, 'link', 'set', self.peer, 'up'])
        run_command(['ip', 'link', 'set', self.interface, 'up'])
        run_command(['ip', '-n', self.namespace, 'route', 'add', 'default', 'via', self.gateway])

    def command(self, args: list[str]) -> list[str]:
        if self.closing or self.closed or not self.namespace_created or '--' not in args:
            raise NetworkError('NsJail network lease is not available')
        boundary = args.index('--')
        # Disable only NsJail's *second* network namespace: nsenter first enters
        # this process's dedicated namespace, never the Runner's network.
        return ['/usr/bin/nsenter', '--net=/run/netns/' + self.namespace, '--', *args[:boundary],
                '--disable_clone_newnet', '--bindmount_ro', str(self.resolv_conf) + ':/etc/resolv.conf',
                *args[boundary:]]

    def close(self) -> None:
        with self.manager.lock, self.lock:
            if self.closed:
                return
            self.closing = True
            try:
                if self.interface_created:
                    run_command(['ip', 'link', 'delete', self.interface])
                    self.interface_created = False
                if self.namespace_created:
                    for pid in run_command(['ip', 'netns', 'pids', self.namespace]).split():
                        try:
                            os.kill(int(pid), signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    run_command(['ip', 'netns', 'delete', self.namespace])
                    self.namespace_created = False
                run_command(['conntrack', '--delete', '--orig-src', self.address], no_entries_ok=True)
                self.resolv_conf.unlink(missing_ok=True)
            except (NetworkError, OSError, ValueError) as error:
                # Quarantine the address; retry from the reaper or shutdown.
                print(f'[nsjail-network] cleanup pending for {self.namespace}: {error}', file=sys.stderr)
                return
            self.closed = True
            self.manager.leases.pop(self.slot, None)


class NetworkManager:
    def __init__(self, config: EgressConfig, state_root: pathlib.Path):
        self.config = config
        self.state_root = state_root / 'egress'
        self.ready = False
        self.table_created = False
        self.leases: dict[int, NetworkLease] = {}
        self.lock = threading.RLock()
        self.next_slot = 0

    @property
    def active_count(self) -> int:
        return len(self.leases)

    def initialize(self) -> None:
        if not self.config.enabled:
            return
        routes = json.loads(run_command(['ip', '-j', '-4', 'route', 'show', 'table', 'all']))
        for route in routes:
            destination = route.get('dst', 'default')
            if destination != 'default' and self.config.pool.overlaps(ipaddress.IPv4Network(destination, strict=False)):
                raise NetworkError('XPERT_NSJAIL_EGRESS_CIDR overlaps an existing Runner route')
        blocked = ', '.join(str(network) for network in BLOCKED)
        dns = ', '.join(self.config.dns_servers)
        # Atomic install; never flush another component's firewall. A preexisting
        # table fails startup instead of silently inheriting unknown rules.
        run_command(['nft', '-f', '-'], input_text=f'''
create table inet xpert_egress
add set inet xpert_egress blocked {{ type ipv4_addr; flags interval; auto-merge; elements = {{ {blocked} }}; }}
add chain inet xpert_egress input {{ type filter hook input priority -10; policy accept; }}
add rule inet xpert_egress input iifname "xje*" counter drop
add chain inet xpert_egress from_jail
add rule inet xpert_egress from_jail meta nfproto ipv6 drop
add rule inet xpert_egress from_jail ip daddr @blocked counter drop
add rule inet xpert_egress from_jail ct state invalid drop
add rule inet xpert_egress from_jail ip daddr {{ {dns} }} udp dport 53 accept
add rule inet xpert_egress from_jail ip daddr {{ {dns} }} tcp dport 53 accept
add rule inet xpert_egress from_jail tcp dport {{ 80, 443 }} accept
add rule inet xpert_egress from_jail drop
add chain inet xpert_egress forward {{ type filter hook forward priority -10; policy accept; }}
add rule inet xpert_egress forward iifname "xje*" jump from_jail
add rule inet xpert_egress forward oifname "xje*" ct state established,related accept
add rule inet xpert_egress forward oifname "xje*" drop
add chain inet xpert_egress postrouting {{ type nat hook postrouting priority srcnat; policy accept; }}
add rule inet xpert_egress postrouting iifname "xje*" ip saddr {self.config.pool} masquerade
''')
        self.table_created = True
        try:
            enable_forwarding()
            self.state_root.mkdir(parents=True, exist_ok=True)
            self.ready = True
        except Exception:
            self.close()
            raise

    def acquire(self) -> NetworkLease | None:
        if not self.config.enabled:
            return None
        with self.lock:
            if not self.ready:
                raise NetworkError('NsJail egress network is not initialized')
            for _ in range(self.config.pool.num_addresses // 4):
                slot = self.next_slot
                self.next_slot = (slot + 1) % (self.config.pool.num_addresses // 4)
                if slot not in self.leases:
                    break
            else:
                raise NetworkError('NsJail egress address pool exhausted')
            lease = NetworkLease(self, slot)
            self.leases[slot] = lease
            try:
                lease.setup()
                return lease
            except Exception:
                lease.close()
                raise

    def reap(self) -> None:
        with self.lock:
            for lease in list(self.leases.values()):
                if lease.closing:
                    lease.close()

    def close(self) -> None:
        with self.lock:
            self.ready = False
            for lease in list(self.leases.values()):
                lease.close()
            # Retain the firewall if cleanup failed; do not open a surviving jail.
            if self.table_created and not self.leases:
                run_command(['nft', 'delete', 'table', 'inet', 'xpert_egress'])
                self.table_created = False
