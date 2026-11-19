import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import oss2

from benchmark import cleanup, production_snapshot, require_empty_destination, verify_production_unchanged
from destination import Destination, RELEASE, from_environment
from mirror import publish_index, verify_release
from stages import finalize, upload_one
from test_mirror import fixture


class BenchmarkTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.directory = Path(temp.name)
        self.name = "Bosi-0.4.1-mac-arm64.dmg"
        self.release = fixture(self.directory, payloads={self.name: b"installer" * 1024})
        self.tag = self.release["tag_name"]
        self.assets = verify_release(self.release, self.directory, self.tag)
        self.destination = Destination("benchmark", "123456789")

    def test_only_explicit_benchmark_mode_and_numeric_run_ids_can_select_temporary_paths(self):
        self.assertEqual(RELEASE.prefix, "bosi")
        self.assertEqual(self.destination.prefix, "bosi/_benchmarks/123456789")
        for mode, run_id in [("release", "123"), ("benchmark", ""), ("benchmark", "../latest.json"),
                             ("benchmark", "123/../.."), ("benchmark", "0"), ("other", "123")]:
            with self.subTest(mode=mode, run_id=run_id), self.assertRaises(ValueError):
                Destination(mode, run_id)
        with patch.dict("os.environ", {"BOSI_OSS_BENCHMARK": "true", "GITHUB_RUN_ID": "123456789"}):
            self.assertEqual(from_environment(), self.destination)
        with patch.dict("os.environ", {"BOSI_OSS_BENCHMARK": "false"}):
            self.assertEqual(from_environment(), RELEASE)
        with patch.dict("os.environ", {"BOSI_OSS_BENCHMARK": "yes"}), self.assertRaises(ValueError):
            from_environment()

    def test_full_staged_upload_and_cleanup_never_access_production_keys_or_publish_an_index(self):
        bucket = MagicMock()
        objects = {}
        prefix = f"{self.destination.prefix}/{self.tag}/"

        def head(key):
            self.assertTrue(key.startswith(prefix), key)
            if key not in objects:
                raise oss2.exceptions.NoSuchKey(404, {}, b"", {})
            data, headers = objects[key]
            crc = oss2.utils.Crc64()
            crc.update(data)
            return SimpleNamespace(content_length=len(data), headers=headers, server_crc=crc.crc)

        def put(key, filename, headers):
            self.assertTrue(key.startswith(prefix), key)
            self.assertNotIn(key, objects)
            objects[key] = (Path(filename).read_bytes(), headers)

        def public_head(url, timeout):
            response = MagicMock()
            response.__enter__.return_value = SimpleNamespace(
                status_code=200, headers=head(url.removeprefix("https://mirror.example.com/")).headers)
            return response

        def delete(keys):
            for key in keys:
                self.assertTrue(key.startswith(prefix), key)
                del objects[key]

        bucket.head_object.side_effect = head
        bucket.put_object_from_file.side_effect = put
        bucket.batch_delete_objects.side_effect = delete
        with patch("stages.PART_SIZE", 4096), patch("mirror.requests.head", side_effect=public_head):
            upload_one(bucket, "mirror.example.com", self.release, self.assets, self.directory,
                       self.name, self.destination)
            finalize(bucket, "mirror.example.com", self.release, self.assets, self.directory, self.destination)
        self.assertEqual(set(objects), {prefix + name for name in self.assets})
        self.assertEqual(bucket.put_object_from_file.call_count, len(self.assets))
        bucket.get_object.assert_not_called()
        bucket.put_object.assert_not_called()
        with self.assertRaisesRegex(ValueError, "never publish"):
            publish_index(bucket, "mirror.example.com", self.release, self.assets, self.destination)
        bucket.put_object.assert_not_called()
        self.assertEqual(cleanup(bucket, self.release, self.destination), "deleted")
        self.assertEqual(objects, {})

    def test_cleanup_rejects_production_and_reports_missing_delete_permission(self):
        bucket = MagicMock()
        with self.assertRaisesRegex(ValueError, "only allowed"):
            cleanup(bucket, self.release, RELEASE)
        bucket.batch_delete_objects.assert_not_called()
        bucket.batch_delete_objects.side_effect = oss2.exceptions.AccessDenied(403, {}, b"", {})
        self.assertEqual(cleanup(bucket, self.release, self.destination), "permission-denied")
        keys = bucket.batch_delete_objects.call_args.args[0]
        self.assertTrue(all(key.startswith(self.destination.prefix + "/") for key in keys))

    def test_new_benchmark_requires_confirmed_empty_objects(self):
        with patch("benchmark.requests.head") as head:
            response = head.return_value.__enter__.return_value
            response.status_code = 404
            require_empty_destination("mirror.example.com", self.release, self.destination)
            self.assertEqual(head.call_count, len(self.assets))
            for status in (200, 403, 500):
                response.status_code = status
                with self.subTest(status=status), self.assertRaisesRegex(ValueError, "empty destination"):
                    require_empty_destination("mirror.example.com", self.release, self.destination)
            with self.assertRaises(ValueError):
                require_empty_destination("mirror.example.com", self.release, RELEASE)

    def test_production_snapshot_detects_index_or_file_changes_and_cross_run_baselines(self):
        response = MagicMock()
        response.content = b'{"tag":"desktop-v0.4.1"}'
        response.headers = {"ETag": "original", "Last-Modified": "original-time", "Content-Length": "123"}
        with patch("benchmark.requests.get") as get, patch("benchmark.requests.head") as head:
            get.return_value.__enter__.return_value = response
            head.return_value.__enter__.return_value = response
            snapshot = production_snapshot("mirror.example.com", self.release, self.destination)
            baseline = self.directory / "before.json"
            baseline.write_text(json.dumps(snapshot))
            verify_production_unchanged("mirror.example.com", self.release, self.destination, baseline)
            response.content = b'{"tag":"desktop-v0.4.2"}'
            with self.assertRaisesRegex(ValueError, "changed"):
                verify_production_unchanged("mirror.example.com", self.release, self.destination, baseline)
            response.content = b'{"tag":"desktop-v0.4.1"}'
            response.headers["Last-Modified"] = "rewritten-time"
            with self.assertRaisesRegex(ValueError, "changed"):
                verify_production_unchanged("mirror.example.com", self.release, self.destination, baseline)
            response.headers["Last-Modified"] = "original-time"
            with self.assertRaisesRegex(ValueError, "changed"):
                verify_production_unchanged("mirror.example.com", self.release, Destination("benchmark", "987"), baseline)
            with self.assertRaises(ValueError):
                production_snapshot("mirror.example.com", self.release, RELEASE)
