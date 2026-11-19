"""Invariants: one verified release snapshot spans all jobs; upload workers never move the index.
Each large object has its own time and credential budget. Finalization requires every object.
"""
import argparse
import base64
from dataclasses import asdict
import json
import os
from pathlib import Path
import re
import subprocess

from mirror import (Asset, PART_SIZE, create_bucket, inspect_file, publish_index,
                    release_assets, sync_asset, verify_release)


def prepare(release, directory, tag, plan_file):
    assets = verify_release(release, directory, tag)
    matrix = {"include": [{"asset": name} for name, asset in assets.items() if asset.size > PART_SIZE]}
    if len(matrix["include"]) > 256:
        raise ValueError("Release exceeds the GitHub matrix job limit")
    plan_file.write_text(json.dumps({"schema": 1, "release": release,
                                    "assets": {name: asdict(asset) for name, asset in assets.items()}}, sort_keys=True))
    return matrix


def read_plan(plan_file, tag):
    plan = json.loads(plan_file.read_text())
    if plan["schema"] != 1:
        raise ValueError("Unsupported OSS plan schema")
    descriptors = release_assets(plan["release"], tag)
    if set(plan["assets"]) != set(descriptors):
        raise ValueError("OSS plan differs from the verified release")
    assets = {}
    for name, descriptor in descriptors.items():
        asset = Asset(**plan["assets"][name])
        if (not re.fullmatch(r"[0-9a-f]{64}", asset.sha256) or
                f"sha256:{asset.sha256}" != descriptor["digest"] or
                type(asset.size) is not int or asset.size != descriptor["size"] or
                type(asset.crc64) is not int or not 0 <= asset.crc64 < 2 ** 64 or
                len(base64.b64decode(asset.content_md5, validate=True)) != 16):
            raise ValueError(f"Invalid verified asset: {name}")
        assets[name] = asset
    return plan["release"], assets


def selection(assets, name):
    if name is None:
        return [key for key, asset in assets.items() if asset.size <= PART_SIZE]
    if name not in assets or assets[name].size <= PART_SIZE:
        raise ValueError("Upload worker must select one verified large asset")
    return [name]


def verify_files(directory, assets, names):
    for name in names:
        if inspect_file(directory / name) != assets[name]:
            raise ValueError(f"Downloaded file differs from the verified release: {name}")


def fetch_files(release, assets, directory, name, run=subprocess.run):
    names = selection(assets, name)
    if names:
        args = ["gh", "release", "download", release["tag_name"], "--repo", "xpert-ai/xpert", "--dir", str(directory)]
        for selected in names:
            args.extend(["--pattern", selected])
        run(args, check=True)
    verify_files(directory, assets, names)


def upload_one(bucket, domain, release, assets, directory, name):
    if name is None:
        raise ValueError("Upload worker must select one verified large asset")
    names = selection(assets, name)
    verify_files(directory, assets, names)
    for selected in names:
        sync_asset(bucket, domain, directory, release["tag_name"], selected, assets[selected])


def finalize(bucket, domain, release, assets, directory):
    names = selection(assets, None)
    verify_files(directory, assets, names)
    for name in names:
        sync_asset(bucket, domain, directory, release["tag_name"], name, assets[name])
    publish_index(bucket, domain, release, assets)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=("prepare", "fetch", "upload", "finalize"))
    parser.add_argument("plan", type=Path)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--release", type=Path)
    parser.add_argument("--asset")
    args = parser.parse_args()
    tag = os.environ["BOSI_TAG"]
    if args.phase == "prepare":
        if args.release is None:
            parser.error("prepare requires --release")
        matrix = prepare(json.loads(args.release.read_text()), args.directory, tag, args.plan)
        print(json.dumps(matrix))
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as output:
                output.write(f"matrix={json.dumps(matrix)}\nupload={'true' if matrix['include'] else 'false'}\n")
    else:
        release, assets = read_plan(args.plan, tag)
        if args.phase == "fetch":
            fetch_files(release, assets, args.directory, args.asset)
        else:
            if args.phase == "upload" and args.asset is None:
                parser.error("upload requires --asset")
            bucket, domain = create_bucket()
            if args.phase == "upload":
                upload_one(bucket, domain, release, assets, args.directory, args.asset)
            else:
                finalize(bucket, domain, release, assets, args.directory)
