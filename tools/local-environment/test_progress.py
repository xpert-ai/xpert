import io
import json
from pathlib import Path
import tempfile
import unittest

from progress import PREFIX, phase, read_progress


class ProgressTests(unittest.TestCase):
    def test_records_timing_and_failure_without_exception_contents(self):
        stream = io.StringIO()
        with self.assertRaises(RuntimeError):
            with phase('schema_apply', stream):
                raise RuntimeError('private credential must not be copied')
        events = [json.loads(line[len(PREFIX):]) for line in stream.getvalue().splitlines()]
        self.assertEqual([event['status'] for event in events], ['running', 'failed'])
        self.assertTrue(all(event['elapsedMs'] >= 0 for event in events))
        self.assertNotIn('credential', stream.getvalue())

    def test_bounded_reader_filters_unknown_fields_and_ignores_partial_events(self):
        with tempfile.TemporaryDirectory() as root:
            logs = Path(root) / 'logs'
            logs.mkdir()
            event = {'phase': 'build', 'status': 'completed', 'elapsedMs': 1234,
                     'at': '2026-11-15T00:00:00Z', 'secret': 'do not expose'}
            (logs / 'api.log').write_text('unrelated private log\n' * 10000 + PREFIX + json.dumps(event) + '\n' + PREFIX + '{')
            progress = read_progress({'state': root}, 'api')
            self.assertEqual(progress['lastPhase']['elapsedMs'], 1234)
            self.assertNotIn('secret', json.dumps(progress))
            self.assertNotIn('private', json.dumps(progress))
            self.assertGreater(progress['logBytes'], 65536)
            self.assertIsNone(read_progress({'state': root}, 'web'))


if __name__ == '__main__':
    unittest.main()
