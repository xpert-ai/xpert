import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import oss2

from mirror import INDEX_KEY, next_index
from destination import RELEASE
from stages import fetch_files, finalize, prepare, read_plan, selection, upload_one
from test_mirror import fixture


class StageTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.directory = Path(temp.name)
        self.plan = self.directory / "oss-plan.json"
        self.large = ["Bosi-0.4.1-mac-arm64.dmg", "extra-release-data.json"]
        self.release = fixture(self.directory, payloads={name: name.encode() * 500 for name in self.large})
        self.tag = self.release["tag_name"]
        limit = patch("stages.PART_SIZE", 4096)
        limit.start()
        self.addCleanup(limit.stop)
        self.matrix = prepare(self.release, self.directory, self.tag, self.plan)
        _, self.assets = read_plan(self.plan, self.tag)

    def test_verified_snapshot_partitions_by_size_without_losing_files(self):
        large = [item["asset"] for item in self.matrix["include"]]
        self.assertEqual(set(large), set(self.large))
        small = selection(self.assets, None)
        self.assertFalse(set(large).intersection(small))
        self.assertEqual(set(large + small), set(self.assets))
        for name in large:
            self.assertEqual(selection(self.assets, name), [name])
        for name in ("missing", "../escape", "SHA256SUMS.txt"):
            with self.assertRaisesRegex(ValueError, "one verified large asset"):
                selection(self.assets, name)
        with patch("stages.PART_SIZE", 100000):
            self.assertEqual(prepare(self.release, self.directory, self.tag, self.plan), {"include": []})

    def test_snapshot_rejects_changed_metadata_and_integrity_fields(self):
        original = self.plan.read_text()
        mutations = [
            lambda plan: plan.update(schema=2),
            lambda plan: plan["release"].update(tag_name="desktop-v0.4.2"),
            lambda plan: plan["release"]["assets"][0].update(name="../escape"),
            lambda plan: plan["assets"].pop(self.large[0]),
            lambda plan: plan["assets"][self.large[0]].update(sha256="0" * 64),
            lambda plan: plan["assets"][self.large[0]].update(size=True),
            lambda plan: plan["assets"][self.large[0]].update(crc64=-1),
            lambda plan: plan["assets"][self.large[0]].update(content_md5="YQ=="),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                plan = json.loads(original)
                mutate(plan)
                self.plan.write_text(json.dumps(plan))
                with self.assertRaises(ValueError):
                    read_plan(self.plan, self.tag)

    def test_fetch_verifies_exact_selected_bytes_before_credentials(self):
        run = MagicMock()
        fetch_files(self.release, self.assets, self.directory, self.large[0], run)
        run.assert_called_once_with([
            "gh", "release", "download", self.tag, "--repo", "xpert-ai/xpert", "--dir", str(self.directory),
            "--pattern", self.large[0]], check=True)
        run.reset_mock()
        fetch_files(self.release, self.assets, self.directory, None, run)
        patterns = run.call_args.args[0][8:]
        self.assertEqual(patterns[::2], ["--pattern"] * len(selection(self.assets, None)))
        self.assertEqual(patterns[1::2], selection(self.assets, None))
        (self.directory / self.large[0]).write_bytes(b"release asset replaced")
        with patch("stages.create_bucket") as create_bucket:
            with self.assertRaisesRegex(ValueError, "differs from the verified release"):
                fetch_files(self.release, self.assets, self.directory, self.large[0], run)
            create_bucket.assert_not_called()

    def test_upload_is_limited_to_one_verified_large_asset(self):
        bucket = MagicMock()
        with patch("stages.sync_asset") as sync, patch("stages.publish_index") as publish:
            upload_one(bucket, "mirror.example.com", self.release, self.assets, self.directory, self.large[0])
            sync.assert_called_once_with(bucket, "mirror.example.com", self.directory, self.tag,
                                         self.large[0], self.assets[self.large[0]], RELEASE)
            publish.assert_not_called()
            for name in (None, "SHA256SUMS.txt", "unknown"):
                with self.assertRaises(ValueError):
                    upload_one(bucket, "mirror.example.com", self.release, self.assets, self.directory, name)
            (self.directory / self.large[0]).write_bytes(b"changed after fetch")
            with self.assertRaisesRegex(ValueError, "differs from the verified release"):
                upload_one(bucket, "mirror.example.com", self.release, self.assets, self.directory, self.large[0])
            self.assertEqual(sync.call_count, 1)

    def test_finalization_requires_every_remote_asset_and_retry_never_overwrites(self):
        bucket = MagicMock()
        objects = {}

        def head(key):
            if key not in objects:
                raise oss2.exceptions.NoSuchKey(404, {}, b"", {})
            data, headers = objects[key]
            crc = oss2.utils.Crc64()
            crc.update(data)
            return SimpleNamespace(content_length=len(data), headers=headers, server_crc=crc.crc)

        def get(key):
            if key not in objects:
                raise oss2.exceptions.NoSuchKey(404, {}, b"", {})
            return io.BytesIO(objects[key])

        def put_file(key, filename, headers):
            self.assertNotIn(key, objects)
            self.assertEqual(headers["x-oss-forbid-overwrite"], "true")
            objects[key] = (Path(filename).read_bytes(), headers)

        bucket.head_object.side_effect = head
        bucket.get_object.side_effect = get
        bucket.put_object_from_file.side_effect = put_file
        bucket.put_object.side_effect = lambda key, data, headers: objects.update({key: data})

        def public_head(url, timeout):
            response = MagicMock()
            remote = head(url.removeprefix("https://mirror.example.com/"))
            response.__enter__.return_value = SimpleNamespace(status_code=200, headers=remote.headers)
            return response

        response = MagicMock()
        response.headers = {"Access-Control-Allow-Origin": "https://xpertai.cn"}
        response.json.side_effect = lambda: json.loads(objects[INDEX_KEY])

        def finish():
            finalize(bucket, "mirror.example.com", self.release, self.assets, self.directory)

        with patch("mirror.requests.head", side_effect=public_head), patch("mirror.requests.get") as public_get:
            public_get.return_value.__enter__.return_value = response
            # A worker failure cannot be hidden by uploading its installer in the short final job.
            with self.assertRaises(oss2.exceptions.NoSuchKey):
                finish()
            self.assertNotIn(INDEX_KEY, objects)
            self.assertEqual(bucket.put_object_from_file.call_count, len(selection(self.assets, None)))
            for name in self.large:
                upload_one(bucket, "mirror.example.com", self.release, self.assets, self.directory, name)
                upload_one(bucket, "mirror.example.com", self.release, self.assets, self.directory, name)
            self.assertNotIn(INDEX_KEY, objects)

            key = f"bosi/{self.tag}/{self.large[0]}"
            valid = objects[key]
            objects[key] = (b"x" * len(valid[0]), valid[1])
            with self.assertRaisesRegex(ValueError, "differs"):
                finish()
            self.assertNotIn(INDEX_KEY, objects)
            objects[key] = valid
            with patch("mirror.requests.head", side_effect=OSError("public endpoint unavailable")):
                with self.assertRaises(OSError):
                    finish()
            self.assertNotIn(INDEX_KEY, objects)

            # The final job needs only small local files, even after a failed-job-only rerun.
            for name in self.large:
                (self.directory / name).unlink()
            finish()
            finish()
            self.assertEqual(bucket.put_object_from_file.call_count, len(self.assets))
            self.assertEqual(bucket.put_object.call_count, 1)
            self.assertEqual(json.loads(objects[INDEX_KEY])["tag"], self.tag)

            newer = {**self.release, "tag_name": "desktop-v0.10.0"}
            objects[INDEX_KEY] = json.dumps(next_index(None, newer, self.assets)).encode()
            finish()
            self.assertEqual(bucket.put_object.call_count, 1)
            self.assertEqual(json.loads(objects[INDEX_KEY])["tag"], "desktop-v0.10.0")
