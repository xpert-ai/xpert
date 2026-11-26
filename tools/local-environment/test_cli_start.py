import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import cli
from processes import ServicePending


class CliStartTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.config = {'platform': str(self.root), 'state': str(self.root), 'runtime': str(self.root),
                       'node': '/node', 'ports': dict(postgres=1, redis=2, api=3, web=4)}
        (self.root / '.xpert-runtime-ready.json').write_text('{}')
        self.args = SimpleNamespace(action='start', platform=str(self.root), state=str(self.root),
                                    project_root=None, service=None, infra_only=False, timeout=60)
        self.stack = contextlib.ExitStack()
        self.stack.enter_context(patch('cli.arguments', return_value=self.args))
        self.stack.enter_context(patch('cli.architecture'))
        self.stack.enter_context(patch('cli.load', return_value=self.config))
        for name in ('infrastructure', 'assert_bootstrapped', 'configure_oidc', 'verify_local_terminal'):
            self.stack.enter_context(patch('cli.' + name))
        self.stop = self.stack.enter_context(patch('cli.stop'))
        self.output = io.StringIO()
        self.stack.enter_context(contextlib.redirect_stdout(self.output))
        self.umask = os.umask(0o077)

    def tearDown(self):
        os.umask(self.umask)
        self.stack.close()
        self.temp.cleanup()

    def test_full_start_makes_api_ready_before_waiting_for_web_and_retry_does_not_restart(self):
        with patch('cli.status', return_value={'status': 'platform_ready'}), \
                patch('cli.start_service') as start:
            start.side_effect = [None, ServicePending('web', 123)]
            self.assertEqual(cli.main(), 75)
            self.assertEqual([call.args[1] for call in start.call_args_list], ['api', 'web'])
            pending = json.loads(self.output.getvalue())
            self.assertTrue(pending['serviceStillRunning'])
            self.assertEqual(pending['nextAction'], 'start')
            start.reset_mock(side_effect=True)
            self.assertEqual(cli.main(), 0)
            self.assertEqual([call.args[1] for call in start.call_args_list], ['api', 'web'])
            self.stop.assert_not_called()

    def test_explicit_api_start_never_starts_web(self):
        self.args.service = 'api'
        with patch('cli.status', return_value={'status': 'api_ready'}), patch('cli.start_service') as start:
            self.assertEqual(cli.main(), 0)
            self.assertEqual([call.args[1] for call in start.call_args_list], ['api'])

    def test_web_failure_keeps_already_started_api_for_agent_diagnosis(self):
        with patch('cli.start_service', side_effect=[None, RuntimeError('web build failed')]):
            with self.assertRaisesRegex(RuntimeError, 'web build failed'):
                cli.main()
        self.stop.assert_not_called()

    def test_full_platform_strict_status_does_not_accept_api_only(self):
        self.args.action = 'status'
        self.args.strict = True
        with patch('cli.service_pid', return_value=123), patch('cli.owns_supervisor', return_value=False), \
                patch('cli.healthy', side_effect=lambda config, name: name != 'web'), \
                patch('cli.source_revision', return_value='source-revision'):
            self.assertEqual(cli.main(), 1)
        self.assertEqual(json.loads(self.output.getvalue())['status'], 'api_ready')

    def test_plugin_retry_requires_explicit_project_binding(self):
        self.args.action = 'retry-plugin-startup'
        with patch('plugin_recovery.retry_startup') as retry:
            with self.assertRaisesRegex(RuntimeError, '--project-root'):
                cli.main()
            retry.assert_not_called()

    def test_plugin_retry_does_not_start_services_or_claim_acceptance(self):
        self.args.action = 'retry-plugin-startup'
        self.args.project_root = str(self.root)
        self.config['projectRoot'] = self.args.project_root
        self.args.snapshot = 'a' * 64 + '.json'
        self.args.expected_sha256 = 'b' * 64
        receipt = {'status': 'plugin_startup_retry_prepared', 'acceptancePassed': False}
        with patch('plugin_recovery.retry_startup', return_value=receipt) as retry, \
                patch('cli.start_service') as start:
            self.assertEqual(cli.main(), 0)
            retry.assert_called_once_with(self.config, self.args.snapshot, self.args.expected_sha256)
            start.assert_not_called()
        self.assertFalse(json.loads(self.output.getvalue())['acceptancePassed'])


if __name__ == '__main__':
    unittest.main()
