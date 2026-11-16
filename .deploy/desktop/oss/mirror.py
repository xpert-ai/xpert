"""Copy an official stable GitHub release byte for byte. Only latest.json is mutable."""
import base64
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time

import oss2
import requests


TAG = re.compile(r"desktop-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
DOMAIN = re.compile(r"(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?")
INDEX_KEY = "bosi/latest.json"
PART_SIZE = 2 * 1024 * 1024
FEEDS = {"desktop-x64.yml", "desktop-arm64.yml", "desktop-x64-linux.yml",
         "desktop-arm64-linux-arm64.yml", "desktop-x64-mac.yml", "desktop-arm64-mac.yml"}


@dataclass(frozen=True)
class Asset:
    sha256: str
    content_md5: str
    crc64: int
    size: int


def version(tag):
    match = TAG.fullmatch(tag)
    if not match:
        raise ValueError(f"Invalid stable desktop tag: {tag}")
    return tuple(map(int, match.groups()))


def verify_release(release, directory, tag):
    version(tag)
    if release["tag_name"] != tag or release["draft"] is not False or release["prerelease"] is not False:
        raise ValueError("Expected a published stable release")
    datetime.fromisoformat(release["published_at"].replace("Z", "+00:00"))
    assets = {}
    for asset in release["assets"]:
        name = asset["name"]
        if (not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", name) or name in assets or
                asset["state"] != "uploaded" or not re.fullmatch(r"sha256:[0-9a-f]{64}", asset["digest"])):
            raise ValueError(f"Invalid GitHub asset: {name}")
        source = directory / name
        sha, md5, crc = hashlib.sha256(), hashlib.md5(), oss2.utils.Crc64()
        with source.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                sha.update(chunk)
                md5.update(chunk)
                crc.update(chunk)
        if source.stat().st_size != asset["size"] or f"sha256:{sha.hexdigest()}" != asset["digest"]:
            raise ValueError(f"GitHub asset checksum or size mismatch: {name}")
        assets[name] = Asset(sha.hexdigest(), base64.b64encode(md5.digest()).decode("ascii"), crc.crc, asset["size"])

    checksums = {}
    for line in (directory / "SHA256SUMS.txt").read_text().splitlines():
        digest, name = line.split("  ", 1)
        if name in checksums:
            raise ValueError(f"Duplicate checksum: {name}")
        checksums[name] = digest
    if checksums != {name: asset.sha256 for name, asset in assets.items()
                     if name not in {"SHA256SUMS.txt", "release-manifest.json"}}:
        raise ValueError("SHA256SUMS.txt differs from release assets")
    required = {"SHA256SUMS.txt", "release-manifest.json"}
    for platform, extensions in {"mac": ["dmg", "zip"], "win": ["exe", "zip"], "linux": ["AppImage", "tar.gz"]}.items():
        for arch in ("arm64", "x64"):
            required.update(f"Bosi-{tag[9:]}-{platform}-{arch}.{ext}" for ext in extensions)
    if required - assets.keys():
        raise ValueError(f"Incomplete Bosi release: {sorted(required - assets.keys())}")
    return assets


def next_index(previous, release, assets):
    tag = release["tag_name"]
    if previous is not None and previous["schema"] != 1:
        raise ValueError("Unsupported OSS index schema")
    feeds = dict(previous["feeds"]) if previous else {}
    for name in FEEDS.intersection(assets):
        if name not in feeds or version(tag) > version(feeds[name]):
            feeds[name] = tag
    if previous and version(tag) < version(previous["tag"]):
        return {**previous, "feeds": feeds}
    return {"schema": 1, "tag": tag, "publishedAt": release["published_at"],
            "assets": sorted(assets), "feeds": feeds}


def upload_asset(bucket, key, source, asset):
    content_type = {"json": "application/json", "yml": "text/yaml", "txt": "text/plain"}.get(
        source.suffix.lstrip("."), "application/octet-stream")
    immutable = {"x-oss-forbid-overwrite": "true"}
    headers = {**immutable, "Content-Type": content_type, "x-oss-meta-sha256": asset.sha256,
               "Cache-Control": "public, max-age=31536000, immutable"}
    if asset.size <= PART_SIZE:
        bucket.put_object_from_file(key, str(source), headers={**headers, "Content-MD5": asset.content_md5})
        return

    # A timed-out part can be sent again under its original number without restarting the installer.
    count = (asset.size + PART_SIZE - 1) // PART_SIZE
    print(f"Uploading {source.name}: {asset.size} bytes in {count} parts", flush=True)
    upload_id = bucket.init_multipart_upload(key, headers=headers).upload_id

    def upload_part(number):
        with source.open("rb") as file:
            file.seek((number - 1) * PART_SIZE)
            data = file.read(PART_SIZE)
        checksum = {"Content-MD5": oss2.utils.content_md5(data)}
        for attempt in range(1, 5):
            try:
                result = bucket.upload_part(key, upload_id, number, data, headers=checksum)
                return oss2.models.PartInfo(number, result.etag, size=len(data), part_crc=result.crc)
            except oss2.exceptions.OssError as error:
                transient = isinstance(error, oss2.exceptions.RequestError) or error.status in (
                    408, 429, 500, 502, 503, 504)
                if not transient or attempt == 4:
                    raise
                print(f"Retrying {source.name} part {number}/{count} after attempt {attempt}", flush=True)
                time.sleep(2 ** (attempt - 1))

    try:
        with ThreadPoolExecutor(max_workers=8) as pool:
            parts = list(pool.map(upload_part, range(1, count + 1)))
        bucket.complete_multipart_upload(key, upload_id, parts, headers=immutable)
    except Exception:
        try:
            bucket.abort_multipart_upload(key, upload_id)
        except oss2.exceptions.OssError as cleanup_error:
            print(f"Could not clean up incomplete upload for {source.name} (status {cleanup_error.status})", flush=True)
        raise


def mirror(bucket, domain, release, directory, tag):
    assets = verify_release(release, directory, tag)
    try:
        previous = json.loads(bucket.get_object(INDEX_KEY).read())
    except oss2.exceptions.NoSuchKey:
        previous = None
    index = next_index(previous, release, assets)
    for name, asset in assets.items():
        key = f"bosi/{tag}/{name}"
        try:
            head = bucket.head_object(key)
        except oss2.exceptions.ServerError as error:
            if error.status != 404:
                raise
            upload_asset(bucket, key, directory / name, asset)
            head = bucket.head_object(key)
        if (head.headers.get("x-oss-meta-sha256") != asset.sha256 or
                head.server_crc != asset.crc64 or head.content_length != asset.size):
            raise ValueError(f"OSS object differs from release: {key}")
        with requests.head(f"https://{domain}/{key}", timeout=30) as response:
            if response.status_code != 200 or response.headers.get("x-oss-meta-sha256") != asset.sha256:
                raise ValueError(f"Public download unavailable or stale: {key}")
        print(f"Verified public asset: {name}", flush=True)
    if index != previous:
        bucket.put_object(INDEX_KEY, json.dumps(index, sort_keys=True).encode(), headers={
            "Content-Type": "application/json", "Cache-Control": "no-cache, max-age=0, must-revalidate",
        })
    origin = "https://xpertai.cn"
    with requests.get(f"https://{domain}/{INDEX_KEY}", headers={"Origin": origin}, timeout=30) as response:
        response.raise_for_status()
        if response.headers.get("Access-Control-Allow-Origin") not in {origin, "*"} or response.json() != index:
            raise ValueError("Public OSS index or website CORS policy differs from the published configuration")
    print(f"Verified {len(assets)} public assets for {tag}. Latest: {index['tag']}")


if __name__ == "__main__":
    domain = os.environ["BOSI_OSS_DOMAIN"]
    if not DOMAIN.fullmatch(domain):
        raise ValueError("BOSI_OSS_DOMAIN must be a lowercase hostname bound directly to OSS")
    auth = oss2.StsAuth(os.environ["ALIBABA_CLOUD_ACCESS_KEY_ID"], os.environ["ALIBABA_CLOUD_ACCESS_KEY_SECRET"],
                        os.environ["ALIBABA_CLOUD_SECURITY_TOKEN"], auth_version=oss2.AUTH_VERSION_4)
    bucket = oss2.Bucket(auth, f"https://{domain}", os.environ["BOSI_OSS_BUCKET"],
                         is_cname=True, region=os.environ["BOSI_OSS_REGION"])
    mirror(bucket, domain, json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2]), os.environ["BOSI_TAG"])
