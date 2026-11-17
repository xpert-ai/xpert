import tempfile
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from platform_services import configure_oidc


class OidcInitializationTests(unittest.TestCase):
    def test_oss_without_initializer_does_not_run_pro_command(self):
        with tempfile.TemporaryDirectory() as directory, patch('platform_services.subprocess.run') as run:
            configure_oidc({'platform': directory})
            run.assert_not_called()

    def test_present_initializer_failure_is_not_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'tools/scripts').mkdir(parents=True)
            (root / 'tools/scripts/setup-oidc.mjs').write_text('// fixture')
            (root / 'logs').mkdir()
            config = {'platform': directory, 'state': directory, 'node': 'node', 'ports': {'web': 4200}}
            with patch('platform_services.child_environment', return_value={}), \
                    patch('platform_services.subprocess.run', return_value=subprocess.CompletedProcess([], 1)):
                with self.assertRaisesRegex(RuntimeError, 'OIDC initialization failed'):
                    configure_oidc(config)


if __name__ == '__main__':
    unittest.main()
