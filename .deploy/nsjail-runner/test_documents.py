import json
import pathlib
import tempfile
import threading
import unittest
from unittest import mock

import runner
from compute_process import ComputeJob
from document_service import DocumentNodeJob, DocumentJavaJob, DocumentNodeService, DocumentJavaService

DEFINITIONS = pathlib.Path(__file__).resolve().parents[2] / 'packages/server-ai/src/sandbox/sandbox-job/runtime-definitions'


class DocumentPolicyTest(unittest.TestCase):
    def definition(self, name):
        return json.loads((DEFINITIONS / name).read_text())

    def test_profiles_have_separate_readonly_roots_and_job_state(self):
        compute = ComputeJob('a' * 64, self.definition('compute-node-python-v1.json'))
        node = DocumentNodeJob('a' * 64, self.definition('document-node-20-v1.json'))
        java = DocumentJavaJob('a' * 64, self.definition('document-java-17-v1.json'))
        self.assertEqual(len({job.root for job in [compute, node, java]}), 3)
        for job in [node, java]:
            args = job.args(['node', '/trusted.mjs'], 300000)
            self.assertEqual(args[args.index('--chroot') + 1], str(job.rootfs))
            self.assertEqual(args[args.index('--cgroup_mem_max') + 1], str(job.definition['resources']['memoryMb'] * 1024 * 1024))
            self.assertEqual(args[args.index('--max_cpus') + 1], '2')
            self.assertEqual(args[args.index('--cgroup_pids_max') + 1], '256')
            self.assertNotIn('--disable_clone_newnet', args)
            self.assertNotIn('--rw', args)
            self.assertNotIn('--keep_caps', args)
        self.assertIn('--iface_no_lo', node.args(['node'], 1))
        self.assertNotIn('--iface_no_lo', java.args(['node'], 1))
        self.assertIn('--iface_no_lo', compute.args(['node'], 1))
        topology = '/sys/devices/system/cpu:/sys/devices/system/cpu'
        self.assertIn(topology, java.args(['node'], 1))
        self.assertNotIn(topology, node.args(['node'], 1))
        self.assertNotIn(topology, compute.args(['node'], 1))
        self.assertEqual(java.args(['node'], 1)[java.args(['node'], 1).index(topology) - 1], '--bindmount_ro')

    def test_only_the_exact_document_definition_is_accepted(self):
        for service_class, file in [(DocumentNodeService, 'document-node-20-v1.json'), (DocumentJavaService, 'document-java-17-v1.json')]:
            service = service_class.__new__(service_class)
            service.definition = self.definition(file)
            service.jobs = {}
            service.lock = threading.RLock()
            service.health = mock.Mock(return_value={'available': True})
            other = self.definition('compute-node-python-v1.json')
            with self.assertRaisesRegex(runner.RunnerError, 'Incompatible'):
                service.create({'runtimeId': 'a' * 64, 'definition': other})
            for key in ['rootfs', 'environment', 'loopback', 'cpuTopology', 'command', 'stateRoot']:
                with self.assertRaises(runner.RunnerError):
                    service.create({'runtimeId': 'a' * 64, 'definition': service.definition, key: '/untrusted'})
            service.health.assert_not_called()

    def test_recovery_never_adopts_another_profile_cgroup(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary) / ('a' * 64)
            root.mkdir()
            (root / 'owner.json').write_text(json.dumps({'version': 1, 'cgroup': 'xpert-compute-' + 'b' * 32 + '-' + root.name}))
            for job_class in [DocumentNodeJob, DocumentJavaJob]:
                with self.assertRaisesRegex(RuntimeError, 'ownership marker'):
                    job_class.recover(root, self.definition('document-node-20-v1.json'))
            self.assertTrue(root.exists())


if __name__ == '__main__':
    unittest.main()
