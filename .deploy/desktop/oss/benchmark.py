"""Invariants: benchmark writes and cleanup are confined to one GitHub run's directory.
The public release and index are read before and after; benchmarking never publishes an index.
"""
from dataclasses import asdict
import hashlib
import json

import oss2
import requests

from mirror import DOMAIN, INDEX_KEY, release_assets


def require_empty_destination(domain, release, destination):
    if destination.mode != "benchmark" or not DOMAIN.fullmatch(domain):
        raise ValueError("Fresh upload checks require an isolated benchmark destination and OSS hostname")
    for name in release_assets(release, release["tag_name"]):
        key = f"{destination.prefix}/{release['tag_name']}/{name}"
        with requests.head(f"https://{domain}/{key}", timeout=30) as response:
            if response.status_code != 404:
                raise ValueError(f"Benchmark requires an empty destination; start a new workflow run: {key}")


def production_snapshot(domain, release, destination):
    if destination.mode != "benchmark" or not DOMAIN.fullmatch(domain):
        raise ValueError("Production snapshots require an isolated benchmark destination and OSS hostname")
    assets = release_assets(release, release["tag_name"])
    headers = ("ETag", "Last-Modified", "Content-Length", "x-oss-meta-sha256", "x-oss-hash-crc64ecma")
    with requests.get(f"https://{domain}/{INDEX_KEY}", timeout=30) as response:
        response.raise_for_status()
        index = {"sha256": hashlib.sha256(response.content).hexdigest(),
                 "headers": {name: response.headers.get(name) for name in headers}}
    files = {}
    for name in assets:
        key = f"bosi/{release['tag_name']}/{name}"
        with requests.head(f"https://{domain}/{key}", timeout=30) as response:
            response.raise_for_status()
            files[name] = {header: response.headers.get(header) for header in headers}
    return {"destination": asdict(destination), "tag": release["tag_name"], "index": index, "files": files}


def verify_production_unchanged(domain, release, destination, baseline_file):
    if json.loads(baseline_file.read_text()) != production_snapshot(domain, release, destination):
        raise ValueError("Production release or index changed during the benchmark")
    print("Verified production release objects and latest.json are unchanged", flush=True)


def cleanup(bucket, release, destination):
    if destination.mode != "benchmark":
        raise ValueError("Cleanup is only allowed for an isolated benchmark destination")
    names = release_assets(release, release["tag_name"])
    keys = [f"{destination.prefix}/{release['tag_name']}/{name}" for name in names]
    try:
        for offset in range(0, len(keys), 1000):
            bucket.batch_delete_objects(keys[offset:offset + 1000])
        for key in keys:
            try:
                bucket.head_object(key)
            except oss2.exceptions.NoSuchKey:
                continue
            raise ValueError(f"Benchmark cleanup left an object: {key}")
    except oss2.exceptions.AccessDenied:
        print(f"::warning::OSS role cannot clean up benchmark objects under {destination.prefix}/", flush=True)
        return "permission-denied"
    return "deleted"
