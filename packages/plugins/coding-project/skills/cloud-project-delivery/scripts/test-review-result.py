import json
import hashlib
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("review-result.py")


class ReviewResultTests(unittest.TestCase):
    def run_report(self, report, subject=None, submission="inline"):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "output").mkdir()
            (root / "output/report.json").write_text(json.dumps(report))
            if subject is not None:
                (root / "review-context.json").write_text(json.dumps({"subject": subject}))
            result = subprocess.run(
                ["python3", str(SCRIPT), "--report", "output/report.json", "--output", "output/envelope.json",
                 "--submission", submission],
                cwd=root, capture_output=True, text=True, timeout=5)
            output = root / "output/envelope.json"
            return result, json.loads(output.read_text()) if output.exists() else None

    def setUp(self):
        self.subject = {"implementationInvocationId": "611c6901-65bd-4b7b-b317-14db04072c0d",
                        "specificationDigest": "sha256:" + "a" * 64,
                        "evidence": [
                            {"type": "invocation_result", "invocationId": "611c6901-65bd-4b7b-b317-14db04072c0d", "revision": 7},
                            {"type": "artifact", "artifactId": "8a047b71-56e5-41fb-87eb-6213bc7ff35b", "versionId": "a9051332-e126-447a-b481-b01d6735f1af"}]}
        self.report = {**self.subject, "version": 2, "mode": "execution", "verdict": "changes_required",
                       "summary": "Reviewer-authored finding", "checks": [
                           {"description": "Invoke candidate", "outcome": "failed", "actual": "Observed mismatch"}],
                       "findings": [{"id": "F1", "kind": "defect", "blocking": True, "description": "A defect"}],
                       "limitations": []}

    def test_preserves_assessment_and_exact_host_identity(self):
        result, output = self.run_report(self.report, self.subject)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(output["summary"]), self.report)

    def test_file_submission_pins_serialized_bytes_without_reprinting_report(self):
        report = {**self.report, "summary": '中文🙂 "quote" \\ path\nline'}
        result, output = self.run_report(report, self.subject, "file")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(output["summary"]), report)
        lines = result.stdout.strip().splitlines()
        self.assertEqual(lines[0], "```xpert-task-result-file")
        content = (json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        self.assertEqual(json.loads(lines[1]), {"version": 1, "path": "output/envelope.json",
                                              "sha256": hashlib.sha256(content).hexdigest()})
        self.assertNotIn("Reviewer-authored", result.stdout)
        self.assertEqual(len(lines), 3)

    def test_rejects_mistyped_version_and_reordered_evidence_before_delivery(self):
        wrong = [*self.subject["evidence"][:-1], {**self.subject["evidence"][-1], "versionId": "a9051332-e126-447a-b481-b01d6735f1ae"}]
        for evidence in [wrong, list(reversed(self.subject["evidence"]))]:
            with self.subTest(evidence=evidence):
                result, output = self.run_report({**self.report, "evidence": evidence}, self.subject)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Report subject differs", result.stderr)
                self.assertIsNone(output)

    def test_rejects_another_implementation(self):
        result, output = self.run_report({**self.report, "implementationInvocationId": "other"}, self.subject)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(output)

    def test_supports_older_hosts_without_machine_readable_subject(self):
        result, output = self.run_report(self.report)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(output["summary"]), self.report)

    def test_rejects_extra_metadata_without_rewriting_or_emitting_it(self):
        report = {**self.report, "reviewRound": 2, "skillsResolved": "PRIVATE-PATH"}
        result, output = self.run_report(report, self.subject)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("reviewRound", result.stderr)
        self.assertIn("skillsResolved", result.stderr)
        self.assertNotIn("PRIVATE-PATH", result.stderr)
        self.assertIsNone(output)

    def test_rejects_missing_and_unknown_nested_fields_before_delivery(self):
        missing = {k: v for k, v in self.report.items() if k != "limitations"}
        for report, path in [
            (missing, "limitations"),
            ({**self.report, "checks": [{**self.report["checks"][0], "extra": "private"}]}, "checks[0]"),
            ({**self.report, "findings": [{**self.report["findings"][0], "severity": "high"}]}, "findings[0]"),
            ({**self.report, "version": True}, "version"),
            ({**self.report, "checks": "passed"}, "checks")
        ]:
            with self.subTest(path=path):
                result, output = self.run_report(report, self.subject)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(path, result.stderr)
                self.assertIsNone(output)

    def test_preserves_supported_optional_fields_and_all_verdicts(self):
        for verdict in ("pass", "changes_required", "indeterminate"):
            report = {**self.report, "verdict": verdict, "findings": [],
                      "checks": [{**self.report["checks"][0], "outcome": "passed", "expected": "Expected result",
                                  "command": "test", "evidencePaths": ["output/check.json"]}]}
            result, output = self.run_report(report, self.subject)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(output["summary"]), report)

    def test_preserves_evidence_only_version_one(self):
        report = {**self.subject, "version": 1, "verdict": "indeterminate", "findings": ["Missing proof"],
                  "limitations": ["No independent execution"]}
        result, output = self.run_report(report, self.subject)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(output["summary"]), report)


if __name__ == "__main__":
    unittest.main()
