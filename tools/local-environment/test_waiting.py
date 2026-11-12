import unittest
from pathlib import Path
import tempfile
from unittest.mock import patch
from platform_services import infrastructure
from processes import ServicePending, healthy, start_service


class ServiceWaitingTests(unittest.TestCase):
    def test_infrastructure_shares_one_readiness_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            (state / 'postgres').mkdir()
            (state / 'postgres/PG_VERSION').write_text('17')
            (state / 'database-initialization.json').write_text('{}')
            config = {'state': directory, 'runtime': directory}
            with patch('platform_services.start_supervisor'), patch('platform_services.sql', return_value='1'), \
                 patch('platform_services.time.monotonic', side_effect=[0, 10, 61]), \
                 patch('platform_services.start_service') as start:
                infrastructure(config, 60)
            self.assertEqual(start.call_args_list[0].args, (config, 'postgres', 50))
            self.assertEqual(start.call_args_list[1].args, (config, 'redis', 0))

    def test_unowned_listener_is_not_healthy(self):
        with patch('processes.service_pid', return_value=0), patch('processes.owns_listener', return_value=False):
            self.assertFalse(healthy({'ports': {'api': 3001}}, 'api'))

    def test_wait_expiry_preserves_owned_process_without_restart(self):
        with patch('processes.healthy', return_value=False), patch('processes.service_pid', return_value=123), \
             patch('processes.time.monotonic', side_effect=[0, 0, 3]), patch('processes.time.sleep'), \
             patch('processes.control') as control:
            with self.assertRaises(ServicePending) as pending:
                start_service({'state': '/state'}, 'web', 2)
        self.assertEqual((pending.exception.service, pending.exception.pid), ('web', 123))
        control.assert_not_called()

    def test_expired_operation_does_not_start_the_next_service(self):
        with patch('processes.healthy', return_value=False), patch('processes.service_pid', return_value=0), \
             patch('processes.control') as control:
            with self.assertRaises(ServicePending) as pending:
                start_service({'state': '/state'}, 'api', 0)
        self.assertEqual(pending.exception.pid, 0)
        control.assert_not_called()

    def test_exited_service_is_failure_not_pending(self):
        with patch('processes.healthy', return_value=False), patch('processes.service_pid', side_effect=[123, 0]), \
             patch('processes.time.monotonic', side_effect=[0, 0]):
            with self.assertRaisesRegex(RuntimeError, 'exited') as failure:
                start_service({'state': '/state'}, 'api', 2)
        self.assertNotIsInstance(failure.exception, ServicePending)


if __name__ == '__main__':
    unittest.main()
