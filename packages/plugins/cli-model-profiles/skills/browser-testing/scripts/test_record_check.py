import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("record_check.py")


class RunReceipts(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.check = self.root / "check.py"
        self.check.write_text("print('check executed')\n")
        self.receipt = self.root / "run.json"

    def record(self, *extra):
        return subprocess.run([sys.executable, str(SCRIPT), "record", "--root", str(self.root),
            "--input", "check.py", "--output", str(self.receipt), "--", sys.executable, "check.py", *extra],
            capture_output=True, text=True)

    def verify(self):
        return subprocess.run([sys.executable, str(SCRIPT), "verify", str(self.receipt)],
                              capture_output=True, text=True)

    def test_exact_run_and_later_script_drift(self):
        self.assertEqual(self.record("private-argument").returncode, 0)
        self.assertEqual(self.verify().returncode, 0)
        receipt = json.loads(self.receipt.read_text())
        self.assertEqual(receipt["businessAcceptance"], "not_assessed")
        self.assertNotIn("private-argument", self.receipt.read_text())
        self.check.write_text("print('not the executed version')\n")
        self.assertEqual(self.verify().returncode, 3)

    def test_does_not_overwrite_previous_evidence(self):
        self.assertEqual(self.record().returncode, 0)
        original = self.receipt.read_bytes()
        self.assertEqual(self.record().returncode, 2)
        self.assertEqual(self.receipt.read_bytes(), original)

    def test_failed_check_preserves_exit_status(self):
        self.check.write_text("raise SystemExit(7)\n")
        self.assertEqual(self.record().returncode, 7)
        self.assertEqual(json.loads(self.receipt.read_text())["processExitCode"], 7)
        verification = self.verify()
        self.assertEqual(verification.returncode, 0)
        self.assertFalse(json.loads(verification.stdout)["commandSucceeded"])
        self.assertEqual(json.loads(verification.stdout)["processExitCode"], 7)

    def test_missing_exit_status_is_incomplete_evidence(self):
        self.assertEqual(self.record().returncode, 0)
        receipt = json.loads(self.receipt.read_text())
        del receipt["processExitCode"]
        self.receipt.write_text(json.dumps(receipt))
        self.assertEqual(self.verify().returncode, 2)

    def test_changes_during_execution_invalidate_success(self):
        self.check.write_text("from pathlib import Path\nPath(__file__).write_text('changed')\n")
        self.assertEqual(self.record().returncode, 3)
        self.assertFalse(json.loads(self.receipt.read_text())["inputsUnchanged"])
        self.assertEqual(self.verify().returncode, 3)

    def test_retargeted_fixture_symlink_invalidates_the_recorded_run(self):
        (self.root / "original.txt").write_text("original fixture")
        (self.root / "replacement.txt").write_text("different fixture")
        (self.root / "fixture.txt").symlink_to("original.txt")
        self.check.write_text(
            "from pathlib import Path\n"
            "fixture = Path('fixture.txt')\n"
            "fixture.unlink()\n"
            "fixture.symlink_to('replacement.txt')\n"
        )
        result = subprocess.run([
            sys.executable, str(SCRIPT), "record", "--root", str(self.root),
            "--input", "check.py", "--input", "fixture.txt", "--output", str(self.receipt),
            "--", sys.executable, "check.py"
        ], capture_output=True, text=True)
        self.assertEqual(result.returncode, 3)
        receipt = json.loads(self.receipt.read_text())
        self.assertEqual(receipt["processExitCode"], 0)
        self.assertFalse(receipt["inputsUnchanged"])
        self.assertEqual(self.verify().returncode, 3)

    def test_unfinished_receipt_and_deleted_input_are_not_passes(self):
        self.receipt.write_text(json.dumps({"version": 1, "state": "running"}))
        self.assertEqual(self.verify().returncode, 2)
        self.receipt.unlink()
        self.assertEqual(self.record().returncode, 0)
        self.check.unlink()
        self.assertEqual(self.verify().returncode, 3)

    def test_independent_copy_and_path_escape(self):
        self.assertEqual(self.record().returncode, 0)
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory)
            (copied / "check.py").write_bytes(self.check.read_bytes())
            result = subprocess.run([sys.executable, str(SCRIPT), "verify", str(self.receipt),
                                     "--root", str(copied)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            # A copied receipt must not allow reading inputs outside its declared project root.
            receipt = json.loads(self.receipt.read_text())
            receipt["inputs"][0]["path"] = str(self.check)
            self.receipt.write_text(json.dumps(receipt))
            result = subprocess.run([sys.executable, str(SCRIPT), "verify", str(self.receipt),
                                     "--root", str(copied)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
