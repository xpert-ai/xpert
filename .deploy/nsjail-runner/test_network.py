import pathlib
import tempfile
import unittest
from unittest import mock

from network import EgressConfig, NetworkManager, NetworkError


class NetworkTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = EgressConfig(enabled=True, dns_servers=('1.1.1.1', '8.8.8.8'))
        self.manager = NetworkManager(self.config, pathlib.Path(self.directory.name))
        self.run = mock.patch('network.run_command').start()
        self.addCleanup(mock.patch.stopall)
        self.run.return_value = '[]'
        self.forward = mock.patch('network.enable_forwarding').start()

    def test_disabled_mode_never_changes_network_or_launches_helpers(self):
        manager = NetworkManager(EgressConfig(), pathlib.Path(self.directory.name))
        manager.initialize()
        self.assertIsNone(manager.acquire())
        manager.close()
        self.run.assert_not_called()
        self.forward.assert_not_called()

    def test_configuration_rejects_private_dns_and_invalid_enable_values(self):
        for dns in ('127.0.0.1', '10.1.2.3', '169.254.169.254', '100.100.100.200', '::1', '168.63.129.16'):
            with self.subTest(dns=dns), self.assertRaises(ValueError):
                EgressConfig.from_environment({'XPERT_NSJAIL_EGRESS_ENABLED': 'true', 'XPERT_NSJAIL_EGRESS_DNS': dns})
        with self.assertRaises(ValueError):
            EgressConfig.from_environment({'XPERT_NSJAIL_EGRESS_ENABLED': 'tru'})

    def test_cannot_launch_when_firewall_initialization_fails(self):
        self.run.side_effect = NetworkError('nft unavailable')
        with self.assertRaises(NetworkError):
            self.manager.initialize()
        self.run.reset_mock(side_effect=True)
        with self.assertRaises(NetworkError):
            self.manager.acquire()
        self.run.assert_not_called()

    def test_policy_blocks_runner_private_ranges_and_ipv6_before_allowing_web(self):
        self.manager.initialize()
        policy = next(call.kwargs['input_text'] for call in self.run.call_args_list if call.args[0][0] == 'nft')
        self.assertIn('create table inet xpert_egress', policy)
        self.assertIn('iifname "xje*" counter drop', policy)
        self.assertIn('meta nfproto ipv6 drop', policy)
        for cidr in ('127.0.0.0/8', '10.0.0.0/8', '169.254.0.0/16', '100.64.0.0/10', '168.63.129.16/32'):
            self.assertIn(cidr, policy)
        self.assertLess(policy.index('ip daddr @blocked counter drop'), policy.index('tcp dport { 80, 443 } accept'))
        self.assertIn('ip daddr { 1.1.1.1, 8.8.8.8 } udp dport 53 accept', policy)
        self.assertIn('oifname "xje*" drop', policy)
        self.assertIn('masquerade', policy)

    def test_each_process_gets_a_separate_namespace_and_immutable_dns(self):
        self.manager.initialize()
        first = self.manager.acquire()
        second = self.manager.acquire()
        self.assertNotEqual(first.namespace, second.namespace)
        self.assertNotEqual(first.address, second.address)
        self.assertEqual(first.resolv_conf.read_text(), 'nameserver 1.1.1.1\nnameserver 8.8.8.8\noptions timeout:2 attempts:2\n')
        self.assertEqual(first.resolv_conf.stat().st_mode & 0o777, 0o444)
        args = first.command(['/usr/local/bin/nsjail', '--', '/bin/bash', '-c', 'true'])
        self.assertEqual(args[:3], ['/usr/bin/nsenter', '--net=/run/netns/' + first.namespace, '--'])
        self.assertLess(args.index('--disable_clone_newnet'), args.index('/bin/bash'))
        self.assertIn(str(first.resolv_conf) + ':/etc/resolv.conf', args)
        with self.assertRaises(NetworkError):
            first.command(['/bin/bash', '-c', 'true'])

    def test_failure_during_setup_removes_partial_network_and_releases_address(self):
        self.manager.initialize()
        def run(args, **kwargs):
            if 'route' in args:
                raise NetworkError('route setup failed')
            return ''
        self.run.side_effect = run
        with self.assertRaises(NetworkError):
            self.manager.acquire()
        commands = [call.args[0] for call in self.run.call_args_list]
        self.assertTrue(any(args[:3] == ['ip', 'link', 'delete'] for args in commands))
        self.assertTrue(any(args[:3] == ['ip', 'netns', 'delete'] for args in commands))
        self.assertEqual(self.manager.active_count, 0)

    def test_close_disconnects_before_deleting_conntrack_and_is_idempotent(self):
        self.manager.initialize()
        lease = self.manager.acquire()
        self.run.reset_mock()
        self.run.return_value = ''
        lease.close()
        commands = [call.args[0] for call in self.run.call_args_list]
        self.assertEqual(commands[0][:3], ['ip', 'link', 'delete'])
        self.assertTrue(any(args[:2] == ['conntrack', '--delete'] for args in commands))
        self.assertEqual(self.manager.active_count, 0)
        self.assertFalse(lease.resolv_conf.exists())
        self.run.reset_mock()
        lease.close()
        self.run.assert_not_called()

    def test_cleanup_failure_quarantines_lease_until_retry(self):
        self.manager.initialize()
        lease = self.manager.acquire()
        self.run.return_value = ''
        self.run.side_effect = NetworkError('cleanup failed')
        lease.close()
        self.assertEqual(self.manager.active_count, 1)
        self.run.side_effect = None
        lease.close()
        self.assertEqual(self.manager.active_count, 0)

    def test_shutdown_releases_all_networks_before_removing_firewall(self):
        self.manager.initialize()
        self.manager.acquire()
        self.manager.acquire()
        self.run.return_value = ''
        self.manager.close()
        self.assertEqual(self.manager.active_count, 0)
        self.assertEqual(self.run.call_args.args[0], ['nft', 'delete', 'table', 'inet', 'xpert_egress'])

    def test_overlapping_runner_route_is_rejected_before_installing_firewall(self):
        self.run.return_value = '[{"dst":"100.127.0.0/16"}]'
        with self.assertRaisesRegex(NetworkError, 'overlaps'):
            self.manager.initialize()
        self.assertFalse(any(call.args[0][0] == 'nft' for call in self.run.call_args_list))

    def test_pool_configuration_rejects_public_ranges_and_supports_an_alternative_private_range(self):
        for cidr in ('1.1.0.0/16', '10.0.0.0/8', '100.127.0.0/30', '::/64'):
            with self.subTest(cidr=cidr), self.assertRaises(ValueError):
                EgressConfig.from_environment({'XPERT_NSJAIL_EGRESS_CIDR': cidr})
        config = EgressConfig.from_environment({'XPERT_NSJAIL_EGRESS_CIDR': '10.254.0.0/16'})
        self.assertEqual(str(config.pool), '10.254.0.0/16')


if __name__ == '__main__':
    unittest.main()
