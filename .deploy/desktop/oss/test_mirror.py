import hashlib
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import oss2

from mirror import INDEX_KEY, mirror, next_index, verify_release


def fixture(directory, ver="0.4.1", feeds=("desktop-x64.yml",)):
    files = {}
    for platform, exts in {"mac": ("dmg", "zip"), "win": ("exe", "zip"), "linux": ("AppImage", "tar.gz")}.items():
        for arch in ("arm64", "x64"):
            for ext in exts:
                name = f"Bosi-{ver}-{platform}-{arch}.{ext}"
                files[name] = name.encode()
    files.update({feed: b"metadata" for feed in feeds})
    files["SHA256SUMS.txt"] = "".join(
        f"{hashlib.sha256(data).hexdigest()}  {name}\n" for name, data in files.items()).encode()
    files["release-manifest.json"] = b"{}"
    assets = []
    for name, data in files.items():
        (directory / name).write_bytes(data)
        assets.append({"name": name, "state": "uploaded", "size": len(data),
                       "digest": f"sha256:{hashlib.sha256(data).hexdigest()}"})
    return {"tag_name": f"desktop-v{ver}", "draft": False, "prerelease": False,
            "published_at": "2026-11-12T10:47:24Z", "assets": assets}


class MirrorTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.directory = Path(temp.name)
        self.release = fixture(self.directory)
        self.tag = self.release["tag_name"]

    def test_partial_or_corrupt_release_is_rejected(self):
        assets = verify_release(self.release, self.directory, self.tag)
        self.assertIn("desktop-x64.yml", assets)
        with self.assertRaisesRegex(ValueError, "stable release"):
            verify_release({**self.release, "draft": True}, self.directory, self.tag)
        with self.assertRaisesRegex(ValueError, "differs"):
            verify_release({**self.release, "assets": self.release["assets"][1:]}, self.directory, self.tag)
        (self.directory / "desktop-x64.yml").write_bytes(b"changed!")
        with self.assertRaisesRegex(ValueError, "checksum"):
            verify_release(self.release, self.directory, self.tag)

    def test_backfill_only_advances_eligible_architectures(self):
        first = next_index(None, self.release, ["desktop-x64.yml", "desktop-x64-mac.yml"])
        newer = fixture(self.directory, "0.10.0")
        latest = next_index(first, newer, ["desktop-x64.yml"])
        self.assertEqual(latest["feeds"]["desktop-x64-mac.yml"], self.tag)
        self.assertEqual(latest["feeds"]["desktop-x64.yml"], newer["tag_name"])
        backfill = next_index(latest, self.release, ["desktop-arm64.yml", "desktop-x64.yml"])
        self.assertEqual(backfill["tag"], newer["tag_name"])
        self.assertEqual(backfill["feeds"]["desktop-arm64.yml"], self.tag)
        self.assertEqual(backfill["feeds"]["desktop-x64.yml"], newer["tag_name"])

    def test_retry_after_interruption_and_public_read_failure(self):
        bucket = MagicMock()
        objects = {}

        def get(key):
            if key not in objects:
                raise oss2.exceptions.NoSuchKey(404, {}, b"", {})
            return io.BytesIO(objects[key])

        def head(key):
            if key not in objects:
                raise oss2.exceptions.NoSuchKey(404, {}, b"", {})
            data, headers = objects[key]
            crc = oss2.utils.Crc64()
            crc.update(data)
            return SimpleNamespace(content_length=len(data), headers=headers, server_crc=crc.crc)

        def put(key, filename, headers):
            self.assertNotIn(key, objects)
            self.assertEqual(headers["x-oss-forbid-overwrite"], "true")
            objects[key] = (Path(filename).read_bytes(), headers)

        bucket.get_object.side_effect = get
        bucket.head_object.side_effect = head
        bucket.put_object_from_file.side_effect = put
        bucket.put_object.side_effect = lambda key, data, headers: objects.update({key: data})

        def public_head(url, timeout):
            key = url.removeprefix("https://mirror.example.com/")
            response = MagicMock()
            response.__enter__.return_value = SimpleNamespace(status_code=200, headers=head(key).headers)
            return response

        def run():
            mirror(bucket, "mirror.example.com", self.release, self.directory, self.tag)

        with patch("mirror.requests.head", side_effect=OSError("connection interrupted")), self.assertRaises(OSError):
            run()
        self.assertEqual(len(objects), 1)
        self.assertNotIn(INDEX_KEY, objects)
        index_response = MagicMock()
        index_response.headers = {"Access-Control-Allow-Origin": "https://xpertai.cn"}
        index_response.json.side_effect = lambda: json.loads(objects[INDEX_KEY])
        with patch("mirror.requests.head", side_effect=public_head), patch("mirror.requests.get") as public_get:
            public_get.return_value.__enter__.return_value = index_response
            run()
            run()
            self.assertEqual(bucket.put_object.call_count, 1)
            self.assertEqual(json.loads(objects[INDEX_KEY])["tag"], self.tag)
            self.assertEqual(bucket.put_object_from_file.call_count, len(self.release["assets"]))
            first_key = next(iter(objects))
            data, headers = objects[first_key]
            objects[first_key] = (b"x" * len(data), headers)
            with self.assertRaisesRegex(ValueError, "differs"):
                run()
            self.assertEqual(bucket.put_object.call_count, 1)
